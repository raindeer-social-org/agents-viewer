// raindeer.social MVP — static host + workspace API + the five-agent runs.
// Zero dependencies: Node's own http and fetch.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, AGENT_LIST, STUDIO_CREATIVE, buildMessages, parseJSON } from './agents.js';
import { loadEnv, chatModels, resolveModel, hasKey, callGroq, tidy } from './groq.js';
import { Store, newId } from './store.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
// PORT is ignored from .env on purpose: the file is shared with the single-page
// demo, and the two servers must not fight over the same port.
loadEnv(path.join(ROOT, '.env'), ['PORT']);

const PORT = Number(process.env.PORT || 4200);
const store = new Store(path.join(ROOT, 'workspace.json'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers for Vercel Frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === '/api/health') {
      return json(res, 200, {
        key: hasKey(),
        model: await resolveModel(),
        agents: AGENT_LIST.map(({ id, name, role, blurb, step }) => ({ id, name, role, blurb, step }))
      });
    }
    if (p === '/api/models') return json(res, 200, { models: await chatModels() });

    if (p === '/api/workspace') {
      if (req.method === 'GET') return json(res, 200, store.data);
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        for (const [section, values] of Object.entries(body)) {
          if (section in store.data) store.patch(section, values);
        }
        return json(res, 200, store.data);
      }
      if (req.method === 'DELETE') return json(res, 200, store.reset());
    }

    if (p === '/api/posts' && req.method === 'POST') {
      const body = await readBody(req);
      const post = store.upsertPost({
        id: body.id || newId(),
        status: 'draft', body: '', hashtags: [], review: null,
        ...body
      });
      return json(res, 200, post);
    }
    if (p.startsWith('/api/posts/')) {
      const id = decodeURIComponent(p.slice('/api/posts/'.length));
      if (req.method === 'PATCH') return json(res, 200, store.upsertPost({ id, ...(await readBody(req)) }));
      if (req.method === 'DELETE') { store.deletePost(id); return json(res, 200, { ok: true }); }
    }

    // Agent runs, each streamed as SSE.
    if (p === '/api/run/strategy' && req.method === 'POST') return runStrategy(req, res);
    if (p === '/api/run/planning' && req.method === 'POST') return runPlanning(req, res);
    if (p === '/api/run/generate' && req.method === 'POST') return runGenerate(req, res);
    if (p === '/api/run/review' && req.method === 'POST') return runReview(req, res);
    if (p === '/api/run/studio' && req.method === 'POST') return runStudio(req, res);

    return serveStatic(p, res);
  } catch (err) {
    console.error('  request failed:', err);
    return json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, async () => {
  console.log(`\n  raindeer.social MVP → http://localhost:${PORT}`);
  console.log(hasKey() ? '  groq key: loaded' : '  groq key: MISSING — add GROQ_API_KEY to app/.env');
  console.log(`  model: ${await resolveModel()}\n`);
});

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function serveStatic(pathname, res) {
  // Client-side routing: unknown non-asset paths fall back to the shell.
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  let file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('403'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(rel)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404'); }
    file = path.join(PUBLIC, 'index.html');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// ── agent execution ────────────────────────────────────────────────

function sse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function runAgent({ agent, state, prior, piece, model, send }) {
  send('stage_start', { id: agent.id, name: agent.name, role: agent.role });
  const started = Date.now();
  const budget = agent.maxTokens(state);
  const messages = buildMessages(agent, state, prior, piece);
  const onWait = (secs) => send('rate_limited', { id: agent.id, secs });

  const { text, usage, finishReason } = await callGroq({
    model, temperature: agent.temperature, maxTokens: budget, messages,
    onToken: (t) => send('token', { id: agent.id, t }), onWait
  });

  let data;
  try {
    data = parseJSON(text);
  } catch {
    send('repair', { id: agent.id });
    // Truncation needs more room; malformed JSON needs a correction turn.
    const retry = finishReason === 'length'
      ? await callGroq({ model, temperature: agent.temperature, maxTokens: budget * 2, messages, onWait })
      : await callGroq({
        model, temperature: 0, maxTokens: budget, onWait,
        messages: [...messages,
          { role: 'assistant', content: text.slice(0, 2000) },
          { role: 'user', content: 'That was not valid JSON. Return the same content as ONE valid JSON object matching the schema. No prose, no code fences.' }]
      });
    data = parseJSON(retry.text);
  }

  const clean = tidy(data);
  const ms = Date.now() - started;
  const tokens = usage?.total_tokens ?? null;
  store.addRun({ agent: agent.id, name: agent.name, ms, tokens, model, at: new Date().toISOString() });
  send('stage_done', { id: agent.id, data: clean, ms, tokens });
  return clean;
}

function guard(res, send, condition, message) {
  if (condition) return false;
  send('failed', { message });
  res.end();
  return true;
}

async function runStrategy(req, res) {
  await readBody(req).catch(() => ({}));
  const send = sse(res);
  if (guard(res, send, hasKey(), 'No GROQ_API_KEY found. Add it to app/.env and restart.')) return;

  const state = store.data;
  if (guard(res, send, state.brand.name && state.brand.what, 'Finish the Setup step first — Aarav needs a brand name and description.')) return;

  const model = state.settings.model || (await resolveModel());
  try {
    const prior = {};
    prior.onboard = await runAgent({ agent: AGENTS.onboard, state, prior, model, send });
    prior.research = await runAgent({ agent: AGENTS.research, state, prior, model, send });
    store.set('strategy', prior);
    send('done', { strategy: prior });
  } catch (err) {
    send('failed', { message: String(err.message || err) });
  }
  res.end();
}

async function runPlanning(req, res) {
  await readBody(req).catch(() => ({}));
  const send = sse(res);
  if (guard(res, send, hasKey(), 'No GROQ_API_KEY found. Add it to app/.env and restart.')) return;

  const state = store.data;
  if (guard(res, send, state.strategy, 'Run the Strategy step first — Keshav plans from the Brand Brain.')) return;
  if (guard(res, send, state.campaign.message, 'Add a core message on the Campaign step first.')) return;

  const model = state.settings.model || (await resolveModel());
  try {
    const planning = await runAgent({ agent: AGENTS.creative, state, prior: state.strategy, model, send });
    store.set('planning', planning);

    // Turn the plan into real calendar slots so the Calendar step opens populated.
    const start = state.campaign.startDate ? new Date(state.campaign.startDate) : new Date();
    const existing = new Set(store.data.posts.map((p) => p.planKey));
    for (const [i, piece] of (planning.plan || []).entries()) {
      const key = `plan-${i}`;
      if (existing.has(key)) continue;
      const when = new Date(start);
      when.setDate(when.getDate() + Math.max(0, (Number(piece.day) || 1) - 1));
      // `|| fallback` is wrong here — a legitimate "10:00" has hour/minute
      // values that are falsy, which silently moved every o'clock slot.
      const [rawH, rawM] = String(piece.time || '09:30').split(':');
      const h = Number(rawH);
      const m = Number(rawM);
      when.setHours(
        Number.isFinite(h) && h >= 0 && h <= 23 ? h : 9,
        Number.isFinite(m) && m >= 0 && m <= 59 ? m : 30,
        0, 0
      );
      store.upsertPost({
        id: newId(), planKey: key, status: 'draft',
        title: piece.title, hook: piece.hook,
        platform: piece.platform || state.brand.platforms[0],
        format: piece.format, scheduledAt: when.toISOString(),
        body: '', hashtags: [], review: null
      });
    }
    send('done', { planning, posts: store.data.posts });
  } catch (err) {
    send('failed', { message: String(err.message || err) });
  }
  res.end();
}

async function runGenerate(req, res) {
  const { id } = await readBody(req).catch(() => ({}));
  const send = sse(res);
  if (guard(res, send, hasKey(), 'No GROQ_API_KEY found. Add it to app/.env and restart.')) return;

  const state = store.data;
  const post = store.getPost(id);
  if (guard(res, send, post, 'That slot no longer exists.')) return;
  if (guard(res, send, state.strategy && state.planning, 'Run Strategy and Planning before generating a post.')) return;

  const model = state.settings.model || (await resolveModel());
  try {
    const out = await runAgent({
      agent: AGENTS.generation, state, prior: state.strategy, model, send,
      piece: { title: post.title, hook: post.hook, platform: post.platform, format: post.format }
    });
    const saved = store.upsertPost({
      id, body: out.body, hashtags: out.hashtags || [],
      imagePrompt: out.image_prompt, altText: out.alt_text,
      status: post.status === 'published' ? 'published' : 'drafted', review: null
    });
    send('done', { post: saved });
  } catch (err) {
    send('failed', { message: String(err.message || err) });
  }
  res.end();
}

async function runReview(req, res) {
  const { id } = await readBody(req).catch(() => ({}));
  const send = sse(res);
  if (guard(res, send, hasKey(), 'No GROQ_API_KEY found. Add it to app/.env and restart.')) return;

  const state = store.data;
  const post = store.getPost(id);
  if (guard(res, send, post && post.body, 'Generate this post before reviewing it.')) return;

  const model = state.settings.model || (await resolveModel());
  try {
    const out = await runAgent({
      agent: AGENTS.reviewer, state, prior: state.strategy, model, send,
      piece: { platform: post.platform, body: post.body, hashtags: post.hashtags }
    });
    const saved = store.upsertPost({
      id,
      review: { scores: out.scores, verdict: out.verdict, issues: out.issues || [], summary: out.summary },
      body: out.final_body || post.body,
      hashtags: out.final_hashtags || post.hashtags,
      status: 'reviewed'
    });
    send('done', { post: saved });
  } catch (err) {
    send('failed', { message: String(err.message || err) });
  }
  res.end();
}

// ── studio ────────────────────────────────────────────────────────
// One post, all five agents, in sequence — the canvas view. Each agent's
// output is the next one's input, which is the whole point of the graph.
async function runStudio(req, res) {
  const { platform, prompt, brand } = await readBody(req).catch(() => ({}));
  const send = sse(res);
  if (guard(res, send, hasKey(), 'No GROQ_API_KEY found. Add it to app/.env and restart.')) return;
  if (guard(res, send, prompt && prompt.trim(), 'Tell the team what the post should be about.')) return;

  // A studio run can carry its own brand without touching the campaign flow.
  if (brand && brand.name && brand.what) store.patch('brand', brand);
  const base = store.data;
  if (guard(res, send, base.brand.name && base.brand.what,
    'Set the brand up first — Aarav needs a name and a description.')) return;

  const state = {
    brand: { ...base.brand, platforms: [platform || base.brand.platforms[0] || 'LinkedIn'] },
    campaign: { ...base.campaign, message: prompt.trim() },
    settings: base.settings
  };
  const model = base.settings.model || (await resolveModel());
  const runStart = Date.now();

  try {
    const prior = {};
    prior.onboard = await runAgent({ agent: AGENTS.onboard, state, prior, model, send });
    state.strategy = prior;
    prior.research = await runAgent({ agent: AGENTS.research, state, prior, model, send });
    state.strategy = prior;

    const creative = await runAgent({ agent: STUDIO_CREATIVE, state, prior, model, send });
    state.planning = creative;

    const piece = {
      title: creative.big_idea,
      hook: (creative.hooks || [])[0],
      platform: state.brand.platforms[0],
      format: creative.format
    };
    const draft = await runAgent({ agent: AGENTS.generation, state, prior, piece, model, send });

    const review = await runAgent({
      agent: AGENTS.reviewer, state, prior, model, send,
      piece: { platform: piece.platform, body: draft.body, hashtags: draft.hashtags }
    });

    const post = {
      platform: piece.platform,
      body: review.final_body || draft.body,
      hashtags: review.final_hashtags || draft.hashtags || [],
      imagePrompt: draft.image_prompt,
      altText: draft.alt_text,
      review: {
        scores: review.scores, verdict: review.verdict,
        issues: review.issues || [], summary: review.summary
      }
    };
    send('done', { post, brief: creative, totalMs: Date.now() - runStart });
  } catch (err) {
    send('failed', { message: String(err.message || err) });
  }
  res.end();
}
