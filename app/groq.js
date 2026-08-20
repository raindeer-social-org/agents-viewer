// Groq client, carried over from the demo with the fixes that run cost us:
// model auto-resolution, low reasoning effort, JSON mode, 429 backoff and a
// network retry. Zero dependencies.

import fs from 'node:fs';

export function loadEnv(file, skip = []) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || skip.includes(m[1])) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const GROQ_URL = () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const KEY = () => process.env.GROQ_API_KEY || '';

// gpt-oss-120b streams answer text directly. The compound models route to it
// internally (their 70k TPM headline doesn't apply) and spend most of their
// budget in a reasoning channel before emitting an answer.
const PREFERRED = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b', 'groq/compound-mini'];
const NOT_CHAT = /whisper|tts|guard|orpheus|embed/i;

let cachedModels = null;
let resolved = null;

export async function chatModels() {
  if (cachedModels) return cachedModels;
  const fallback = process.env.GROQ_MODEL || PREFERRED[0];
  if (!KEY()) return (cachedModels = [fallback]);
  try {
    const r = await fetch(`${GROQ_URL()}/models`, { headers: { authorization: `Bearer ${KEY()}` } });
    const body = await r.json();
    const ids = (body.data || []).map((m) => m.id).filter((id) => !NOT_CHAT.test(id)).sort();
    cachedModels = ids.length ? ids : [fallback];
  } catch {
    cachedModels = [fallback];
  }
  return cachedModels;
}

export async function resolveModel() {
  if (resolved) return resolved;
  const available = await chatModels();
  const wanted = process.env.GROQ_MODEL || PREFERRED[0];
  if (available.includes(wanted)) return (resolved = wanted);
  const pick = PREFERRED.find((m) => available.includes(m)) || available[0];
  console.log(`  note: "${wanted}" is not on this Groq account — using "${pick}" instead`);
  return (resolved = pick);
}

export function hasKey() { return Boolean(KEY()); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reasoning models spend max_tokens thinking before they write; low effort cuts
// that from ~350 tokens to ~6. JSON mode removes malformed output. Models that
// reject either param get it dropped after the first complaint.
const unsupported = new Set();
function extras(model) {
  const e = {};
  if (!unsupported.has(`${model}:reasoning_effort`)) e.reasoning_effort = 'low';
  if (!unsupported.has(`${model}:response_format`)) e.response_format = { type: 'json_object' };
  return e;
}

export async function callGroq({ model, messages, temperature, maxTokens = 1000, onToken, onWait, attempt = 0 }) {
  let r;
  try {
    r = await fetch(`${GROQ_URL()}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY()}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model, messages, temperature, max_tokens: maxTokens,
        stream: Boolean(onToken), ...extras(model)
      })
    });
  } catch (err) {
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

    if (r.status === 400) {
      const field = ['reasoning_effort', 'response_format'].find((f) => msg.includes(f));
      if (field && !unsupported.has(`${model}:${field}`)) {
        console.warn(`  ${model} does not support ${field}; continuing without it`);
        unsupported.add(`${model}:${field}`);
        return callGroq({ model, messages, temperature, maxTokens, onToken, onWait, attempt });
      }
    }

    // Free tier is 8,000 tokens/minute. Groq says how long to wait; wait it out
    // rather than failing a run in front of a room.
    if (r.status === 429 && attempt < 2) {
      const suggested = Number(msg.match(/try again in ([\d.]+)s/i)?.[1] || r.headers.get('retry-after') || 20);
      const secs = Math.min(Math.ceil(suggested) + 1, 60);
      console.warn(`  429 on ${model}: waiting ${secs}s`);
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

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  let usage = null;
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
      else if (d.reasoning) { reasoning += d.reasoning; onToken(d.reasoning); }
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      if (chunk.x_groq?.usage) usage = chunk.x_groq.usage;
      if (chunk.usage) usage = chunk.usage;
    }
  }
  return { text: text || reasoning, usage, finishReason };
}

// Models love non-breaking hyphens and narrow spaces, which look wrong the
// moment someone pastes a post into LinkedIn.
const TYPO = [[/[‐‑]/g, '-'], [/[   ]/g, ' '], [/[‘’]/g, "'"], [/[“”]/g, '"']];

export function tidy(node, key) {
  if (typeof node === 'string') {
    let s = node;
    for (const [re, to] of TYPO) s = s.replace(re, to);
    if (key === 'hashtags' || key === 'final_hashtags') {
      s = s.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }
    return s;
  }
  if (Array.isArray(node)) return node.map((v) => tidy(v, key));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, tidy(v, k)]));
  }
  return node;
}
