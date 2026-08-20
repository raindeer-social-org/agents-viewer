// Step 6 — the approval queue. Everything Kavi has written, waiting on the one
// human decision the deck promises.

import { $, esc, arr, toast, pfBadge, pf, fmtDate, fmtTime } from '../ui.js';
import { ws, refresh } from '../state.js';
import { api } from '../api.js';
import { stageCards, streamInto } from '../pipeline.js';
import { go } from '../app.js';

const card = (p) => {
  const meta = pf(p.platform);
  const chars = (p.body || '').length;
  const rev = p.review;
  return `<div class="card" data-post="${esc(p.id)}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div class="row" style="gap:8px;margin-bottom:5px">
          ${pfBadge(p.platform)}<span class="pill ${esc(p.status)}">${esc(p.status)}</span>
          ${rev ? `<span class="pill ${esc(rev.verdict)}">${esc(String(rev.verdict).replace('_', ' '))}</span>` : ''}
        </div>
        <h2 style="font-size:1.1rem">${esc(p.title || 'Untitled')}</h2>
        <p class="mono" style="font-size:.5625rem;color:var(--ink-4);margin-top:3px">
          ${esc(fmtDate(p.scheduledAt))} · ${esc(fmtTime(p.scheduledAt))}</p>
      </div>
      <div class="row">
        ${!rev ? `<button class="btn btn-ghost btn-sm" data-review="${esc(p.id)}">Review with Neer</button>` : ''}
        ${p.status !== 'published' ? `<button class="btn btn-primary btn-sm" data-approve="${esc(p.id)}">Approve &amp; publish</button>` : ''}
      </div>
    </div>

    <div class="post">
      <div class="post-who">
        <div class="avatar">${esc((ws.brand.name || 'R')[0].toUpperCase())}</div>
        <div><div class="who-n">${esc(ws.brand.name)}</div><div class="who-s">via raindeer</div></div>
      </div>
      <div class="post-body">${esc(p.body)}</div>
      ${arr(p.hashtags).length ? `<div class="post-tags">${arr(p.hashtags).map((h) => `#${esc(h)}`).join(' ')}</div>` : ''}
      <div class="post-foot"><span class="${chars > meta.limit ? 'over' : ''}">${chars} / ${meta.limit} chars</span>
        <span>${arr(p.hashtags).length} tags</span></div>
    </div>

    <div id="rev-${esc(p.id)}"></div>

    ${rev ? `<div style="margin-top:12px">
      <div class="grid g4">${Object.entries(rev.scores || {}).map(([k, v]) => `
        <div class="score"><div class="s-top"><span class="s-name">${esc(k.replace(/_/g, ' '))}</span>
        <span class="s-val">${esc(v)}</span></div><div class="meter"><i style="width:${Number(v) || 0}%"></i></div></div>`).join('')}</div>
      ${arr(rev.issues).length ? `<ul class="list" style="margin-top:10px">${arr(rev.issues).map((i) =>
        `<li><span class="pill ${esc(i.severity)}">${esc(i.severity)}</span> ${esc(i.note)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
  </div>`;
};

export default {
  async render(view) {
    const queue = (ws.posts || []).filter((p) => p.body).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 06 · Reviewer</p>
          <h1>Review queue</h1>
          <p class="lede">Neer scores brand fit, accuracy, platform fit, safety and personalization,
            and strips any claim the brand cannot back. You make one decision.</p>
        </div>
      </div>
      ${queue.length ? queue.map(card).join('') : `<div class="empty"><h3>Nothing written yet</h3>
        Book a slot and have Kavi write it — drafts land here for approval.
        <div class="row" style="justify-content:center;margin-top:14px">
          <a class="btn btn-primary btn-sm" href="#/calendar">Open the calendar</a></div></div>`}`;

    view.addEventListener('click', async (e) => {
      const approve = e.target.closest('[data-approve]')?.dataset.approve;
      if (approve) {
        await api.updatePost(approve, { status: 'published', publishedAt: new Date().toISOString() });
        toast('Approved and published');
        await refresh();
        return go('review');
      }

      const id = e.target.closest('[data-review]')?.dataset.review;
      if (!id) return;
      const btn = e.target.closest('[data-review]');
      // Only one review at a time: two live runs would put two #stage-reviewer
      // cards in the DOM and the stream would paint into the wrong one.
      const buttons = [...view.querySelectorAll('[data-review]')];
      buttons.forEach((b) => { b.disabled = true; });
      btn.textContent = 'Neer is reading';
      $(`#rev-${id}`, view).innerHTML = stageCards([{
        id: 'reviewer', name: 'Neer', role: 'Reviewer',
        blurb: 'Reviews quality, accuracy, brand fit, relevance, safety, and personalization'
      }]);
      try {
        await streamInto('/api/run/review', { id }, {
          onDone: async () => { toast('Reviewed'); await refresh(); go('review'); },
          onFail: (m) => { toast(m); buttons.forEach((b) => { b.disabled = false; }); btn.textContent = 'Review with Neer'; }
        });
      } catch (err) {
        toast(err.message);
        buttons.forEach((b) => { b.disabled = false; });
        btn.textContent = 'Review with Neer';
      }
    });
  }
};
