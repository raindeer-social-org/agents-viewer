// Step 8 — Analytics. Two kinds of number live here and they are labelled
// differently on purpose: agent telemetry is measured, engagement is modelled.
// No platform account is connected, so nothing here is real reach.

import { esc, arr, pfBadge, fmtDate } from '../ui.js';
import { ws } from '../state.js';

// Deterministic per post, so the same post shows the same estimate every render
// instead of numbers that dance while someone is presenting.
function seeded(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
}

const REACH_BASE = { LinkedIn: 1400, X: 900, Instagram: 1800, Threads: 700, Facebook: 1100 };

function project(post) {
  const rnd = seeded(post.id);
  const base = REACH_BASE[post.platform] || 1000;
  const quality = (post.review?.scores?.brand_fit ?? 75) / 100;
  const reach = Math.round(base * (0.6 + rnd() * 0.8) * (0.7 + quality * 0.5));
  const engRate = 0.02 + rnd() * 0.04 + quality * 0.01;
  const eng = Math.round(reach * engRate);
  return {
    reach,
    views: Math.round(reach * (1.1 + rnd() * 0.5)),
    likes: Math.round(eng * 0.62),
    comments: Math.round(eng * 0.14),
    shares: Math.round(eng * 0.12),
    saves: Math.round(eng * 0.12),
    engRate: engRate * 100
  };
}

const stat = (k, v, d = '') => `<div class="stat"><div class="k">${esc(k)}</div>
  <div class="v">${esc(v)}</div>${d ? `<div class="d">${esc(d)}</div>` : ''}</div>`;

// Bar chart of posts per day across the campaign — this one is real.
function cadenceChart(posts) {
  if (!posts.length) return '';
  const byDay = new Map();
  for (const p of posts) {
    const k = new Date(p.scheduledAt).toDateString();
    byDay.set(k, (byDay.get(k) || 0) + 1);
  }
  const days = [...byDay.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0]));
  const max = Math.max(...days.map(([, n]) => n));
  const w = Math.max(560, days.length * 54);
  const bw = Math.min(30, (w - 40) / days.length - 12);
  return `<div class="card"><p class="card-title">Publishing cadence — scheduled pieces per day</p>
    <div style="overflow-x:auto"><svg viewBox="0 0 ${w} 170" width="${w}" height="170" role="img"
      aria-label="Scheduled posts per day across the campaign">
      ${days.map(([day, n], i) => {
        const x = 24 + i * ((w - 48) / days.length);
        const h = (n / max) * 104;
        return `<g>
          <rect x="${x}" y="${124 - h}" width="${bw}" height="${h}" rx="4" fill="url(#g)"></rect>
          <text x="${x + bw / 2}" y="${118 - h}" text-anchor="middle" font-size="10"
            font-family="Fragment Mono, monospace" fill="#66748F">${n}</text>
          <text x="${x + bw / 2}" y="146" text-anchor="middle" font-size="9"
            font-family="Fragment Mono, monospace" fill="#9AA4BA">${esc(fmtDate(day))}</text>
        </g>`;
      }).join('')}
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2470EA"></stop><stop offset="100%" stop-color="#8AB6FA"></stop>
      </linearGradient></defs>
    </svg></div></div>`;
}

export default {
  async render(view) {
    const posts = ws.posts || [];
    const published = posts.filter((p) => p.status === 'published');
    const runs = ws.runs || [];
    const totals = published.map(project).reduce((a, p) => {
      for (const k of ['reach', 'views', 'likes', 'comments', 'shares', 'saves']) a[k] = (a[k] || 0) + p[k];
      return a;
    }, {});
    const avgEng = published.length
      ? (published.map(project).reduce((a, p) => a + p.engRate, 0) / published.length).toFixed(1)
      : '0.0';
    const totalMs = runs.reduce((a, r) => a + (r.ms || 0), 0);
    const totalTokens = runs.reduce((a, r) => a + (r.tokens || 0), 0);
    const byAgent = runs.reduce((m, r) => {
      const e = m[r.name] || { name: r.name, agent: r.agent, calls: 0, ms: 0, tokens: 0 };
      e.calls += 1; e.ms += r.ms || 0; e.tokens += r.tokens || 0;
      m[r.name] = e;
      return m;
    }, {});
    const platMix = posts.reduce((m, p) => { m[p.platform] = (m[p.platform] || 0) + 1; return m; }, {});

    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Dashboard · Analytics</p>
          <h1>Analytics</h1>
          <p class="lede">What the team actually cost to run, and what this campaign is
            projected to do once it ships.</p>
        </div>
      </div>

      <p class="card-title">Measured — the agent team</p>
      <div class="grid g4">
        ${stat('Agent calls', runs.length, 'across all five agents')}
        ${stat('Compute time', `${(totalMs / 1000).toFixed(1)}s`, 'total wall clock')}
        ${stat('Tokens used', totalTokens || '—', 'prompt + completion')}
        ${stat('Pieces produced', posts.filter((p) => p.body).length, `${published.length} approved`)}
      </div>

      ${Object.keys(byAgent).length ? `<div class="card" style="margin-top:14px">
        <p class="card-title">Per agent</p>
        <table><thead><tr><th>Agent</th><th>Calls</th><th>Total time</th><th>Avg</th><th>Tokens</th></tr></thead>
        <tbody>${Object.values(byAgent).map((a) => `<tr>
          <td><b style="color:var(--ink)">${esc(a.name)}</b> <span class="mono"
            style="font-size:.625rem;color:var(--ink-4)">${esc(a.agent)}</span></td>
          <td>${a.calls}</td><td>${(a.ms / 1000).toFixed(1)}s</td>
          <td>${(a.ms / a.calls / 1000).toFixed(1)}s</td><td>${a.tokens || '—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}

      ${cadenceChart(posts)}

      <p class="card-title" style="margin-top:22px">Projected — engagement</p>
      <div class="note warn" style="margin-bottom:14px">
        No social account is connected, so these are modelled from platform
        averages and Neer's brand-fit score — not measured reach. Connecting a
        real account is what replaces this with live numbers.
      </div>
      <div class="grid g4">
        ${stat('Est. reach', (totals.reach || 0).toLocaleString('en-IN'), 'across published posts')}
        ${stat('Views', (totals.views || 0).toLocaleString('en-IN'))}
        ${stat('Avg. eng. rate', `${avgEng}%`, 'target 3.0%')}
        ${stat('Likes', (totals.likes || 0).toLocaleString('en-IN'))}
        ${stat('Comments', (totals.comments || 0).toLocaleString('en-IN'))}
        ${stat('Shares', (totals.shares || 0).toLocaleString('en-IN'))}
        ${stat('Saves', (totals.saves || 0).toLocaleString('en-IN'))}
        ${stat('Platforms', Object.keys(platMix).length || 0, Object.keys(platMix).join(', ') || '—')}
      </div>

      ${published.length ? `<div class="card" style="margin-top:14px">
        <p class="card-title">Per post — projected</p>
        <table><thead><tr><th>Post</th><th>Platform</th><th>Reach</th><th>Likes</th>
          <th>Comments</th><th>Eng. rate</th><th>Brand fit</th></tr></thead>
        <tbody>${published.map((p) => {
          const m = project(p);
          return `<tr>
            <td><b style="color:var(--ink)">${esc(p.title || 'Untitled')}</b></td>
            <td><span class="row" style="gap:6px;flex-wrap:nowrap">${pfBadge(p.platform)}${esc(p.platform)}</span></td>
            <td>${m.reach.toLocaleString('en-IN')}</td><td>${m.likes}</td><td>${m.comments}</td>
            <td>${m.engRate.toFixed(1)}%</td>
            <td>${p.review?.scores?.brand_fit ?? '—'}</td></tr>`;
        }).join('')}</tbody></table></div>` : ''}`;
  }
};
