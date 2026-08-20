// raindeer.social — pitch demo server.
// Zero dependencies: Node's own http + fetch. Static files out of ./public,
// the agent pipeline streamed to the browser over SSE.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, buildMessages, parseJSON } from './agents.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 4173);
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const CONFIGURED_MODEL = process.env.GROQ_MODEL || '';
const GROQ_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

// Groq's catalogue moves — models get retired without notice. Rather than
// hard-code one and 404 in front of an investor, ask the account what it
// actually has and pick the best available.
// gpt-oss-120b first: it streams answer text directly. The compound models
// route to it internally anyway (their 70k TPM headline doesn't apply — the
// 429s name gpt-oss-120b), and they spend most of their budget in a reasoning
// channel before emitting any answer.
const PREFERRED = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b', 'groq/compound-mini'];
const NOT_CHAT = /whisper|tts|guard|orpheus|embed/i;
let cachedModels = null;
let resolvedModel = CONFIGURED_MODEL || PREFERRED[0];

async function chatModels() {
  if (cachedModels) return cachedModels;
  if (!GROQ_KEY) return (cachedModels = [resolvedModel]);
  try {
    const r = await fetch(`${GROQ_URL}/models`, { headers: { authorization: `Bearer ${GROQ_KEY}` } });
    const body = await r.json();
    const ids = (body.data || []).map((m) => m.id).filter((id) => !NOT_CHAT.test(id)).sort();
    cachedModels = ids.length ? ids : [resolvedModel];
  } catch {
    cachedModels = [resolvedModel];
  }
  return cachedModels;
}

async function resolveModel() {
  const available = await chatModels();
  if (available.includes(resolvedModel)) return resolvedModel;
  const pick = PREFERRED.find((m) => available.includes(m)) || available[0];
  if (pick !== resolvedModel) {
    console.log(`  note: "${resolvedModel}" is not on this Groq account — using "${pick}" instead`);
    resolvedModel = pick;
  }
  return resolvedModel;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers for Vercel Frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    return json(res, 200, {
      key: Boolean(GROQ_KEY),
      model: await resolveModel(),
      agents: AGENTS.map(({ id, name, role, blurb }) => ({ id, name, role, blurb }))
    });
  }

  if (url.pathname === '/api/models') return listModels(res);
  if (url.pathname === '/api/run' && req.method === 'POST') return runPipeline(req, res);

  return serveStatic(url.pathname, res);
});

server.listen(PORT, async () => {
  console.log(`\n  raindeer.social demo → http://localhost:${PORT}`);
  console.log(GROQ_KEY
    ? '  groq key: loaded'
    : '  groq key: MISSING — add GROQ_API_KEY to demo/.env and restart');
  console.log(`  model: ${await resolveModel()}\n`);
});

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('404');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function listModels(res) {
  return json(res, 200, { models: await chatModels() });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function runPipeline(req, res) {
  const brief = await readBody(req);
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (!GROQ_KEY) {
    send('failed', { message: 'No GROQ_API_KEY found. Add it to demo/.env and restart the server.' });
    return res.end();
  }

  const model = brief.model || (await resolveModel());
  const prior = {};
  const receipt = [];
  const runStart = Date.now();

  for (const agent of AGENTS) {
    send('stage_start', { id: agent.id, name: agent.name, role: agent.role, model });
    const started = Date.now();
    try {
      const budget = agent.maxTokens(brief);
      const messages = buildMessages(agent, brief, prior);
      const onWait = (secs) => send('rate_limited', { id: agent.id, secs });

      const { text, usage, finishReason } = await callGroq({
        model,
        temperature: agent.temperature,
        maxTokens: budget,
        messages,
        onToken: (t) => send('token', { id: agent.id, t }),
        onWait
      });

      let data;
      try {
        data = parseJSON(text);
      } catch (parseErr) {
        send('repair', { id: agent.id });
        console.warn(`  repair: ${agent.id} finish=${finishReason} len=${text.length} err=${parseErr.message}`);
        // Truncation and malformed-JSON are different failures. A cut-off
        // response just needs more room; re-sending it back as context is
        // pure waste and is what tips the run into a rate limit.
        const retry = finishReason === 'length'
          ? await callGroq({ model, temperature: agent.temperature, maxTokens: budget * 2, messages, onWait })
          : await callGroq({
            model,
            temperature: 0,
            maxTokens: budget,
            onWait,
            messages: [
              ...messages,
              { role: 'assistant', content: text.slice(0, 2000) },
              { role: 'user', content: 'That was not valid JSON. Return the same content as ONE valid JSON object matching the schema. No prose, no code fences.' }
            ]
          });
        data = parseJSON(retry.text);
      }

      prior[agent.id] = tidy(data);
      const ms = Date.now() - started;
      const tokens = usage?.total_tokens ?? null;
      receipt.push({ id: agent.id, name: agent.name, role: agent.role, ms, tokens, model });
      send('stage_done', { id: agent.id, data: prior[agent.id], ms, tokens });
    } catch (err) {
      send('failed', { id: agent.id, message: String(err.message || err) });
      return res.end();
    }
  }

  send('done', { receipt, totalMs: Date.now() - runStart, result: prior });
  res.end();
}

// Models love non-breaking hyphens and narrow spaces, which look wrong the
// moment someone pastes the post into LinkedIn. Prompting for ASCII helps but
// doesn't hold; this does.
const TYPO = [
  [/[‐‑]/g, '-'],
  [/[   ]/g, ' '],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"']
];

function tidy(node, key) {
  if (typeof node === 'string') {
    let s = node;
    for (const [re, to] of TYPO) s = s.replace(re, to);
    // Hashtags have to survive a platform's own parser: letters and digits only.
    if (key === 'hashtags') s = s.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return s;
  }
  if (Array.isArray(node)) return node.map((v) => tidy(v, key));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, tidy(v, k)]));
  }
  return node;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reasoning models spend max_tokens on thinking before they write a word, and
// on this tier that thinking is what truncates the answer. Low effort cuts it
// from ~350 tokens to ~6; JSON mode removes malformed output entirely. Not
// every model takes these, so they're dropped on the first complaint.
const unsupported = new Set();
function extras(model) {
  const e = {};
  if (!unsupported.has(`${model}:reasoning_effort`)) e.reasoning_effort = 'low';
  if (!unsupported.has(`${model}:response_format`)) e.response_format = { type: 'json_object' };
  return e;
}

async function callGroq({ model, messages, temperature, maxTokens = 1000, onToken, onWait, attempt = 0 }) {
  let r;
  try {
    r = await fetch(`${GROQ_URL}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${GROQ_KEY}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: Boolean(onToken),
        ...extras(model)
      })
    });
  } catch (err) {
    // A dropped socket or timeout shouldn't end the run — try once more.
    if (attempt < 2) {
      console.warn(`  network error on ${model} (${err.message}); retrying`);
      await sleep(1500);
      return callGroq({ model, messages, temperature, maxTokens, onToken, onWait, attempt: attempt + 1 });
    }
    throw new Error(`Could not reach Groq: ${err.message}`);
  }

  if (!r.ok) {
    const detail = await r.text();
    let msg = detail;
    try { msg = JSON.parse(detail).error?.message || detail; } catch {}

    // Some models reject the optional params. Note it and retry plainly.
    if (r.status === 400) {
      const field = ['reasoning_effort', 'response_format'].find((f) => msg.includes(f));
      if (field && !unsupported.has(`${model}:${field}`)) {
        console.warn(`  ${model} does not support ${field}; continuing without it`);
        unsupported.add(`${model}:${field}`);
        return callGroq({ model, messages, temperature, maxTokens, onToken, onWait, attempt });
      }
    }

    // Free-tier TPM is easy to hit. Groq tells us exactly how long to wait —
    // wait it out and carry on rather than failing the run in front of a room.
    if (r.status === 429 && attempt < 2) {
      const suggested = Number(msg.match(/try again in ([\d.]+)s/i)?.[1] || r.headers.get('retry-after') || 20);
      const secs = Math.min(Math.ceil(suggested) + 1, 60);
      console.warn(`  429 on ${model}: waiting ${secs}s — ${msg.slice(0, 150)}`);
      onWait?.(secs);
      await sleep(secs * 1000);
      return callGroq({ model, messages, temperature, maxTokens, onToken, onWait, attempt: attempt + 1 });
    }
    throw new Error(`Groq ${r.status}: ${msg}`);
  }

  if (!onToken) {
    const body = await r.json();
    return {
      text: body.choices[0]?.message?.content || '',
      usage: body.usage,
      finishReason: body.choices[0]?.finish_reason
    };
  }

  // Groq speaks OpenAI-style SSE: `data: {...}` lines, terminated by [DONE].
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = null;
  let reasoning = '';
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let chunk;
      try { chunk = JSON.parse(payload); } catch { continue; }
      const d = chunk.choices?.[0]?.delta || {};
      if (d.content) { text += d.content; onToken(d.content); }
      // Compound models emit the answer in a reasoning channel and may never
      // switch to `content`; keep it as a fallback rather than returning ''.
      else if (d.reasoning) { reasoning += d.reasoning; onToken(d.reasoning); }
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      if (chunk.x_groq?.usage) usage = chunk.x_groq.usage;
      if (chunk.usage) usage = chunk.usage;
    }
  }
  return { text: text || reasoning, usage, finishReason };
}
