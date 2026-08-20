// Studio — the infinite canvas. Pick a platform, say what the post is for, and
// watch context travel Aarav → Ved → Keshav → Kavi → Neer, ending in a preview
// rendered as the platform itself would render it.

import { $, esc, arr, toast, pfBadge } from '../ui.js';
import { ws, health, save } from '../state.js';
import { runStream } from '../api.js';
import { renderAgent } from '../pipeline.js';
import { createCanvas } from '../studio/canvas.js';
import { renderPreview, PLATFORMS } from '../studio/previews.js';

const AGENTS = [
  { id: 'onboard', name: 'Aarav', role: 'On Board', orb: 'grad',
    blurb: 'Learns brand identity, goals, audience, voice, history, and positioning' },
  { id: 'research', name: 'Ved', role: 'Research', orb: 'solid',
    blurb: 'Researches markets, competitors, trends, audiences, and platform behavior' },
  { id: 'creative', name: 'Keshav', role: 'Creative', orb: 'grad',
    blurb: 'Defines creative direction, formats, hooks, visuals, and platform strategy' },
  { id: 'generation', name: 'Kavi', role: 'Generation', orb: 'solid',
    blurb: 'Generates personalized, platform-ready content using brand and research context' },
  { id: 'reviewer', name: 'Neer', role: 'Reviewer', orb: 'grad',
    blurb: 'Reviews quality, accuracy, brand fit, relevance, safety, and personalization' }
];

const IDEAS = [
  'Why deferring marketing is the most expensive way to save money',
  'One myth our customers believe that costs them the most',
  'Announce a milestone without sounding like a press release',
  'Teach one thing our audience gets wrong every week'
];

// Node geometry — a left-to-right chain with the preview parked at the end.
const NODE_W = 300;
const NODE_H = 268;
const GAP = 86;
const layout = () => {
  const nodes = [{ id: 'brief', x: 0, y: 40, w: 268, h: 214 }];
  AGENTS.forEach((a, i) => {
    nodes.push({
      id: a.id,
      x: 268 + GAP + i * (NODE_W + GAP),
      // A gentle sine offset so the chain reads as a flow, not a ruler.
      y: i % 2 === 0 ? 0 : 96,
      w: NODE_W, h: NODE_H
    });
  });
  const last = nodes[nodes.length - 1];
  nodes.push({ id: 'preview', x: last.x + NODE_W + GAP + 20, y: -60, w: 560, h: 620 });
  return nodes;
};

const EDGES = [
  { from: 'brief', to: 'onboard' },
  ...AGENTS.slice(0, -1).map((a, i) => ({ from: a.id, to: AGENTS[i + 1].id })),
  { from: 'reviewer', to: 'preview' }
];

let platform = 'LinkedIn';
let prompt = '';
let canvas = null;
let running = false;
const results = {};

const orb = (a) => `<div class="st-orb ${a.orb}"><span class="st-orb-i">${esc(a.name.slice(0, 2).toUpperCase())}</span></div>`;

const agentShell = (a, badge = 'queued', badgeClass = '') => `
  <div class="st-node">
    <div class="st-node-head">
      ${orb(a)}
      <div class="st-id"><p class="st-role">${esc(a.role)}</p><p class="st-name">${esc(a.name)}</p></div>
      <span class="st-badge ${badgeClass}" data-badge="${esc(a.id)}">${esc(badge)}</span>
    </div>
    <p class="st-blurb">${esc(a.blurb)}</p>
    <div class="st-node-body" data-body="${esc(a.id)}"></div>
  </div>`;

// Each agent shows the one or two things that matter, not its whole JSON.
function summary(id, d) {
  const row = (k, v) => `<div><p class="st-k">${esc(k)}</p><p class="st-v">${esc(v)}</p></div>`;
  switch (id) {
    case 'onboard':
      return `<div class="st-out">
        <div><p class="st-k">Positioning</p><p class="st-v q">${esc(d.positioning)}</p></div>
        <div class="st-mini">${arr(d.voice).slice(0, 4).map((v) => `<span class="st-pillet">${esc(v)}</span>`).join('')}</div>
        <div class="st-mini">${arr(d.pillars).slice(0, 3).map((v) => `<span class="st-pillet grey">${esc(v)}</span>`).join('')}</div>
      </div>`;
    case 'research':
      return `<div class="st-out">
        <div><p class="st-k">Lead signal</p><p class="st-v">${esc(arr(d.trends)[0]?.signal || '—')}</p></div>
        ${row('Best window', d.best_time?.window || '—')}
        <div class="st-mini">${arr(d.trends).map((t) =>
          `<span class="st-pillet grey">${esc(t.confidence || 'low')}</span>`).join('')}</div>
      </div>`;
    case 'creative':
      return `<div class="st-out">
        <div><p class="st-k">Big idea</p><p class="st-v q">${esc(d.big_idea)}</p></div>
        <div><p class="st-k">Hook</p><p class="st-v">${esc(arr(d.hooks)[0] || '—')}</p></div>
      </div>`;
    case 'generation':
      return `<div class="st-out">
        <div><p class="st-k">Draft · ${esc((d.body || '').length)} chars</p>
          <p class="st-v">${esc((d.body || '').slice(0, 190))}${(d.body || '').length > 190 ? '…' : ''}</p></div>
        <div class="st-mini">${arr(d.hashtags).slice(0, 4).map((h) => `<span class="st-pillet">#${esc(h)}</span>`).join('')}</div>
      </div>`;
    case 'reviewer': {
      const s = d.scores || {};
      return `<div class="st-out">
        <div class="st-scores">${Object.entries(s).map(([k, v]) => `
          <div class="st-sc"><p class="n">${esc(v)}</p><div class="bar"><i style="width:${Number(v) || 0}%"></i></div>
            <p class="l">${esc(k.split('_')[0])}</p></div>`).join('')}</div>
        <div><p class="st-k">Verdict — ${esc(String(d.verdict || '').replace('_', ' '))}</p>
          <p class="st-v">${esc(d.summary || '')}</p></div>
      </div>`;
    }
    default:
      return '';
  }
}

function briefNode() {
  return `<div class="st-brief">
    <div><p class="st-k">Publishing to</p>
      <p class="st-v" style="display:flex;align-items:center;gap:8px;margin-top:4px">
        ${pfBadge(platform)} ${esc(platform)}</p></div>
    <div style="flex:1;min-height:0;overflow:hidden">
      <p class="st-k">The ask</p>
      <p class="st-v">${prompt ? esc(prompt) : 'Type what this post should do, up in the bar.'}</p></div>
    <div><p class="st-k">Brand context</p>
      <p class="st-v">${ws.brand.name ? esc(ws.brand.name) : '<span style="color:var(--negative)">Set a brand in Setup</span>'}</p></div>
  </div>`;
}

function previewNode(post) {
  if (!post) {
    return `<div class="st-prevwrap"><div class="st-prev-empty"><div>
      <p class="big">The finished post lands here</p>
      <p>Rendered as ${esc(platform)} would render it.</p></div></div></div>`;
  }
  return `<div class="st-prevwrap">${renderPreview(post.platform, {
    brandName: ws.brand.name || 'Your brand',
    handle: (ws.brand.website || ws.brand.name || 'brand').replace(/^https?:\/\//, '').replace(/\..*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase(),
    avatarLetter: (ws.brand.name || 'R')[0].toUpperCase(),
    body: post.body,
    hashtags: arr(post.hashtags),
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    subtitle: ws.brand.industry || ws.brand.audience || '',
    imagePrompt: post.imagePrompt || '',
    altText: post.altText || ''
  })}</div>`;
}

// Full agent output in the shared drawer, reusing the pipeline renderers.
function openDetail(id) {
  const data = results[id];
  if (!data) return;
  const a = AGENTS.find((x) => x.id === id);
  $('.scrim')?.remove();
  $('.drawer')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="scrim" data-close="1"></div>
    <aside class="drawer" role="dialog" aria-label="${esc(a.name)} output">
      <div class="drawer-head">
        <div><p class="role">${esc(a.role)}</p><h2>${esc(a.name)}</h2>
          <p class="blurb">${esc(a.blurb)}</p></div>
        <button class="x" data-close="1">✕</button>
      </div>
      <div class="drawer-body"><div class="result">${renderAgent(id, data)}</div></div>
    </aside>`);
  const close = (e) => {
    if (!e.target.closest('[data-close]')) return;
    $('.scrim')?.remove();
    $('.drawer')?.remove();
    document.removeEventListener('click', close);
  };
  document.addEventListener('click', close);
}

async function run(view) {
  if (running) return;
  if (!prompt.trim()) return toast('Tell the team what the post should be about.');
  if (!ws.brand.name || !ws.brand.what) return toast('Set a brand up in Setup first — Aarav reads from it.');

  running = true;
  const runBtn = $('#stRun', view);
  runBtn.disabled = true;
  runBtn.innerHTML = 'Running <span class="arr">…</span>';
  for (const a of AGENTS) {
    results[a.id] = null;
    canvas.setNodeState(a.id, 'idle');
    canvas.setNodeHTML(a.id, agentShell(a));
  }
  canvas.setNodeHTML('brief', briefNode());
  canvas.setNodeHTML('preview', previewNode(null));
  EDGES.forEach((e) => canvas.pulseEdge(e.from, e.to, false));
  canvas.pulseEdge('brief', 'onboard', true);

  const raw = {};
  const started = Date.now();
  const status = $('#stStatus', view);
  const tick = setInterval(() => {
    status.innerHTML = `<span>running</span><span class="sep"></span><b>${((Date.now() - started) / 1000).toFixed(1)}s</b>`;
  }, 100);

  let tokens = 0;
  try {
    await runStream('/api/run/studio', { platform, prompt }, {
      stage_start: (d) => {
        raw[d.id] = '';
        const a = AGENTS.find((x) => x.id === d.id);
        canvas.setNodeState(d.id, 'active');
        canvas.setNodeHTML(d.id, agentShell(a, 'thinking', 'active'));
        const body = document.querySelector(`[data-body="${d.id}"]`);
        if (body) body.innerHTML = `<div class="st-stream" data-stream="${d.id}"><span class="st-cursor"></span></div>`;
        canvas.focus(d.id);
        const inbound = EDGES.find((e) => e.to === d.id);
        if (inbound) canvas.pulseEdge(inbound.from, inbound.to, true);
      },
      token: (d) => {
        raw[d.id] = (raw[d.id] || '') + d.t;
        const el = document.querySelector(`[data-stream="${d.id}"]`);
        if (!el) return;
        el.textContent = raw[d.id].slice(-620);
        el.insertAdjacentHTML('beforeend', '<span class="st-cursor"></span>');
      },
      repair: (d) => {
        const b = document.querySelector(`[data-badge="${d.id}"]`);
        if (b) b.textContent = 'reformatting';
      },
      rate_limited: (d) => {
        const b = document.querySelector(`[data-badge="${d.id}"]`);
        if (!b) return;
        let left = d.secs;
        b.textContent = `waiting ${left}s`;
        const t = setInterval(() => {
          left -= 1;
          if (left <= 0 || !b.isConnected || !b.textContent.startsWith('waiting')) return clearInterval(t);
          b.textContent = `waiting ${left}s`;
        }, 1000);
      },
      stage_done: (d) => {
        results[d.id] = d.data;
        tokens += d.tokens || 0;
        const a = AGENTS.find((x) => x.id === d.id);
        canvas.setNodeState(d.id, 'done');
        canvas.setNodeHTML(d.id, `${agentShell(a, `${(d.ms / 1000).toFixed(1)}s`, 'done')}`);
        const body = document.querySelector(`[data-body="${d.id}"]`);
        if (body) {
          body.innerHTML = summary(d.id, d.data);
          body.insertAdjacentHTML('afterend',
            `<div class="st-foot"><span>${d.tokens ? `${d.tokens} tokens` : 'done'}</span>
             <button class="st-more" data-detail="${esc(d.id)}">see everything</button></div>`);
        }
        const inbound = EDGES.find((e) => e.to === d.id);
        if (inbound) canvas.pulseEdge(inbound.from, inbound.to, false);
      },
      done: (d) => {
        canvas.setNodeHTML('preview', previewNode(d.post));
        canvas.setNodeState('preview', 'done');
        canvas.pulseEdge('reviewer', 'preview', false);
        canvas.focus('preview');
        clearInterval(tick);
        status.innerHTML = `<span>complete</span><span class="sep"></span><b>${(d.totalMs / 1000).toFixed(1)}s</b>
          <span class="sep"></span><span>5 agents</span><span class="sep"></span><b>${tokens || '—'} tokens</b>`;
        toast('Post ready');
      },
      failed: (d) => {
        clearInterval(tick);
        if (d.id) canvas.setNodeState(d.id, 'error');
        status.innerHTML = `<span style="color:var(--negative)">${esc(d.message)}</span>`;
        toast(d.message);
      }
    });
  } catch (err) {
    toast(err.message);
  } finally {
    clearInterval(tick);
    running = false;
    runBtn.disabled = false;
    runBtn.innerHTML = 'Run the team <span class="arr">→</span>';
  }
}

export default {
  async render(view) {
    view.classList.add('view-full');
    platform = ws.brand.platforms?.[0] || 'LinkedIn';

    view.innerHTML = `
      <div class="st">
        <div class="st-bar">
          <div class="st-bar-row">
            <span class="st-label">Platform</span>
            <div class="st-plats" id="stPlats">${PLATFORMS.map((p) =>
              `<button type="button" class="st-plat" data-plat="${esc(p)}" aria-pressed="${p === platform}">
                ${pfBadge(p)}<span>${esc(p)}</span></button>`).join('')}</div>
          </div>
          <div class="st-ask">
            <input id="stPrompt" placeholder="What should this post do? e.g. convince founders that deferring marketing costs more than doing it"
              value="${esc(prompt)}" autocomplete="off">
            <button class="st-run" id="stRun">Run the team <span class="arr">→</span></button>
          </div>
          <div class="st-ideas" id="stIdeas">${IDEAS.map((i) =>
            `<button type="button" class="st-idea" data-idea="${esc(i)}">${esc(i)}</button>`).join('')}</div>
        </div>

        <div id="stCanvas" style="position:absolute;inset:0"></div>
        <div class="st-status" id="stStatus"><span>idle</span><span class="sep"></span>
          <b>${esc(ws.settings.model || health.model || 'groq')}</b></div>
      </div>`;

    canvas = createCanvas($('#stCanvas', view), {
      nodes: layout(),
      edges: EDGES,
      onNodeClick: (id) => { if (results[id]) openDetail(id); }
    });

    canvas.setNodeHTML('brief', briefNode());
    AGENTS.forEach((a) => canvas.setNodeHTML(a.id, agentShell(a)));
    canvas.setNodeHTML('preview', previewNode(null));
    canvas.fit();

    view.addEventListener('click', (e) => {
      const plat = e.target.closest('[data-plat]');
      if (plat) {
        platform = plat.dataset.plat;
        view.querySelectorAll('[data-plat]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === plat)));
        canvas.setNodeHTML('brief', briefNode());
        canvas.setNodeHTML('preview', previewNode(null));
        save('brand', { platforms: [platform] });
        return;
      }
      const idea = e.target.closest('[data-idea]');
      if (idea) {
        prompt = idea.dataset.idea;
        $('#stPrompt', view).value = prompt;
        canvas.setNodeHTML('brief', briefNode());
        return;
      }
      const detail = e.target.closest('[data-detail]');
      if (detail) return openDetail(detail.dataset.detail);
      if (e.target.closest('#stRun')) return run(view);
    });

    const input = $('#stPrompt', view);
    input.addEventListener('input', () => { prompt = input.value; });
    input.addEventListener('change', () => canvas.setNodeHTML('brief', briefNode()));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(view); });
  },

  destroy() {
    canvas?.destroy();
    canvas = null;
  }
};
