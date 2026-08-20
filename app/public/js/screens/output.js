// Step 7 — everything approved, ready to copy out to the platforms.

import { esc, arr, toast, pfBadge, pf, fmtDate, fmtTime } from '../ui.js';
import { ws } from '../state.js';

export default {
  async render(view) {
    const done = (ws.posts || []).filter((p) => p.status === 'published')
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    const runs = ws.runs || [];
    const totalMs = runs.reduce((a, r) => a + (r.ms || 0), 0);
    const totalTokens = runs.reduce((a, r) => a + (r.tokens || 0), 0);

    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 07 · Output</p>
          <h1>Publish-ready output</h1>
          <p class="lede">Approved posts, in the shape each platform expects.</p>
        </div>
      </div>

      ${done.length ? `<div class="receipt" style="margin-bottom:16px"><div class="r-row">
        <div class="r-item"><span class="k">Posts ready</span><span class="v">${done.length}</span></div>
        <div class="r-item"><span class="k">Agent calls</span><span class="v">${runs.length}</span></div>
        <div class="r-item"><span class="k">Compute time</span><span class="v">${(totalMs / 1000).toFixed(1)}s</span></div>
        <div class="r-item"><span class="k">Tokens</span><span class="v">${totalTokens || '—'}</span></div>
        <div class="r-item"><span class="k">Human decisions</span><span class="v">${done.length}</span></div>
      </div></div>` : ''}

      ${done.length ? `<div class="grid g2">${done.map((p) => {
        const meta = pf(p.platform);
        const tagLine = arr(p.hashtags).map((h) => `#${h}`).join(' ');
        const chars = (p.body || '').length + (tagLine ? tagLine.length + 1 : 0);
        return `<div class="post">
          <div class="post-top">
            <span class="row" style="gap:8px">${pfBadge(p.platform)}
              <span class="mono" style="font-size:.5rem;letter-spacing:.13em;text-transform:uppercase">${esc(p.platform)}</span></span>
            <button class="btn btn-ghost btn-sm" data-copy="${esc(p.id)}">copy</button>
          </div>
          <div class="post-who">
            <div class="avatar">${esc((ws.brand.name || 'R')[0].toUpperCase())}</div>
            <div><div class="who-n">${esc(ws.brand.name)}</div>
              <div class="who-s">${esc(fmtDate(p.scheduledAt))} · ${esc(fmtTime(p.scheduledAt))}</div></div>
          </div>
          <div class="post-body">${esc(p.body)}</div>
          ${tagLine ? `<div class="post-tags">${esc(tagLine)}</div>` : ''}
          <div class="post-foot">
            <span class="${chars > meta.limit ? 'over' : ''}">${chars} / ${meta.limit} chars</span>
            <span>${esc(p.format || 'text')}</span>
            <span>reviewed by Neer</span>
          </div>
        </div>`;
      }).join('')}</div>` : `<div class="empty"><h3>Nothing approved yet</h3>
        Approve a reviewed post and it lands here ready to publish.
        <div class="row" style="justify-content:center;margin-top:14px">
          <a class="btn btn-primary btn-sm" href="#/review">Go to review</a></div></div>`}`;

    view.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-copy]')?.dataset.copy;
      if (!id) return;
      const p = ws.posts.find((x) => x.id === id);
      const tagLine = arr(p.hashtags).map((h) => `#${h}`).join(' ');
      await navigator.clipboard.writeText(tagLine ? `${p.body}\n\n${tagLine}` : p.body);
      toast('Copied');
    });
  }
};
