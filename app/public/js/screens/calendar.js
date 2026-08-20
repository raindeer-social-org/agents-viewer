// Step 5 — the calendar. Month and week views, click any empty slot to book a
// post, click a booked one to open it: Kavi writes it, Neer reviews it.

import { $, $$, esc, arr, toast, pfBadge, pf, fmtDate, fmtTime, sameDay, toLocalInput } from '../ui.js';
import { ws, refresh } from '../state.js';
import { api } from '../api.js';
import { stageCards, streamInto } from '../pipeline.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 → 22:00

let cursor = new Date();
let mode = 'month';

const postsOn = (d) => (ws.posts || [])
  .filter((p) => sameDay(new Date(p.scheduledAt), d))
  .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

// Monday-first grid start for the month containing `d`.
function gridStart(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const back = (first.getDay() + 6) % 7;
  const s = new Date(first);
  s.setDate(first.getDate() - back);
  s.setHours(0, 0, 0, 0);
  return s;
}

function weekStart(d) {
  const s = new Date(d);
  s.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  s.setHours(0, 0, 0, 0);
  return s;
}

const evChip = (p) => `<div class="ev ${esc(p.status)}" data-open="${esc(p.id)}" title="${esc(p.title || 'Untitled')}">
  <span class="t">${esc(fmtTime(p.scheduledAt))}</span><span class="n">${esc(p.title || 'Untitled')}</span></div>`;

function monthView() {
  const start = gridStart(cursor);
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const other = d.getMonth() !== cursor.getMonth();
    const posts = postsOn(d);
    return `<div class="day ${other ? 'other' : ''} ${sameDay(d, today) ? 'today' : ''}"
        data-book="${d.toISOString()}">
      <span class="daynum">${d.getDate()}</span>
      <span class="add-hint">+</span>
      ${posts.map(evChip).join('')}
    </div>`;
  }).join('');
  return `<div class="cal">
    <div class="cal-head">${DAYS.map((d) => `<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div></div>`;
}

function weekView() {
  const start = weekStart(cursor);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const rows = HOURS.map((h) => `
    <div class="hour-label">${String(h).padStart(2, '0')}:00</div>
    ${days.map((d) => {
      const slot = new Date(d);
      slot.setHours(h, 0, 0, 0);
      const here = postsOn(d).filter((p) => new Date(p.scheduledAt).getHours() === h);
      return `<div class="slot" data-book="${slot.toISOString()}">${here.map(evChip).join('')}</div>`;
    }).join('')}`).join('');
  return `<div class="cal">
    <div class="week-head"><div></div>${days.map((d) =>
      `<div class="${sameDay(d, today) ? 'now' : ''}">${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()}</div>`).join('')}</div>
    <div class="week">${rows}</div></div>`;
}

function title() {
  if (mode === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const s = weekStart(cursor);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}

function paint(view) {
  $('#calTitle', view).textContent = title();
  $('#calHost', view).innerHTML = mode === 'month' ? monthView() : weekView();
}

// ── the post drawer ───────────────────────────────────────────────
function closeDrawer() {
  $('.scrim')?.remove();
  $('.drawer')?.remove();
}

function drawer(post, view) {
  closeDrawer();
  const meta = pf(post.platform);
  const chars = (post.body || '').length;
  const rev = post.review;
  const html = `
    <div class="scrim" data-close="1"></div>
    <aside class="drawer" role="dialog" aria-label="Post detail">
      <div class="drawer-head">
        <div>
          <div class="row" style="gap:8px;margin-bottom:6px">
            ${pfBadge(post.platform)}
            <span class="pill ${esc(post.status)}">${esc(post.status)}</span>
            ${rev ? `<span class="pill ${esc(rev.verdict)}">${esc(String(rev.verdict).replace('_', ' '))}</span>` : ''}
          </div>
          <h2>${esc(post.title || 'Untitled slot')}</h2>
          <p class="mono" style="font-size:.625rem;color:var(--ink-4);margin-top:4px">
            ${esc(fmtDate(post.scheduledAt, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${esc(fmtTime(post.scheduledAt))}</p>
        </div>
        <button class="x" data-close="1">✕</button>
      </div>

      <div class="drawer-body">
        ${post.hook ? `<div><span class="res-label">Hook</span><p class="res-quote">${esc(post.hook)}</p></div>` : ''}

        <div class="grid g2">
          <label class="field" style="margin:0"><span>Platform</span>
            <select id="dPlatform">${['LinkedIn', 'X', 'Instagram', 'Threads', 'Facebook'].map((p) =>
              `<option${p === post.platform ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
          <label class="field" style="margin:0"><span>Scheduled for</span>
            <input type="datetime-local" id="dWhen" value="${esc(toLocalInput(post.scheduledAt))}"></label>
        </div>

        <div id="agentHost"></div>

        ${post.body ? `
          <div>
            <span class="res-label">Post</span>
            <div class="post">
              <div class="post-top">
                <span class="mono" style="font-size:.5rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)">Preview</span>
                <button class="btn btn-ghost btn-sm" id="dCopy">copy</button>
              </div>
              <div class="post-who">
                <div class="avatar">${esc((ws.brand.name || 'R')[0].toUpperCase())}</div>
                <div><div class="who-n">${esc(ws.brand.name)}</div><div class="who-s">via raindeer</div></div>
              </div>
              <div class="post-body">${esc(post.body)}</div>
              ${arr(post.hashtags).length ? `<div class="post-tags">${arr(post.hashtags).map((h) => `#${esc(h)}`).join(' ')}</div>` : ''}
              <div class="post-foot">
                <span class="${chars > meta.limit ? 'over' : ''}">${chars} / ${meta.limit} chars</span>
                <span>${arr(post.hashtags).length} tags</span>
              </div>
            </div>
          </div>
          <label class="field" style="margin:0"><span>Edit the copy</span>
            <textarea id="dBody" rows="7">${esc(post.body)}</textarea></label>` : ''}

        ${rev ? `<div>
          <span class="res-label">Neer's review — ${esc(rev.summary || '')}</span>
          <div class="grid g4" style="margin-top:8px">${Object.entries(rev.scores || {}).map(([k, v]) => `
            <div class="score"><div class="s-top"><span class="s-name">${esc(k.replace(/_/g, ' '))}</span>
              <span class="s-val">${esc(v)}</span></div>
              <div class="meter"><i style="width:${Number(v) || 0}%"></i></div></div>`).join('')}</div>
          ${arr(rev.issues).length ? `<ul class="list" style="margin-top:10px">${arr(rev.issues).map((i) =>
            `<li><span class="pill ${esc(i.severity)}">${esc(i.severity)}</span> ${esc(i.note)}</li>`).join('')}</ul>` : ''}
        </div>` : ''}
      </div>

      <div class="drawer-foot">
        <button class="btn btn-primary btn-sm" id="dGenerate">${post.body ? 'Rewrite with Kavi' : 'Write it with Kavi'}</button>
        ${post.body ? '<button class="btn btn-ghost btn-sm" id="dReview">Review with Neer</button>' : ''}
        ${post.body ? `<button class="btn btn-ghost btn-sm" id="dPublish">${post.status === 'published' ? 'Published' : 'Mark published'}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="dSave">Save</button>
        <button class="btn btn-danger btn-sm" id="dDelete">Delete</button>
      </div>
    </aside>`;
  document.body.insertAdjacentHTML('beforeend', html);

  const drawerEl = $('.drawer');
  const reopen = async () => { await refresh(); paint(view); drawer(ws.posts.find((p) => p.id === post.id), view); };

  document.body.addEventListener('click', async function onClick(e) {
    if (!document.body.contains(drawerEl)) return document.body.removeEventListener('click', onClick);
    if (e.target.closest('[data-close]')) return closeDrawer();

    if (e.target.closest('#dCopy')) {
      const tagLine = arr(post.hashtags).map((h) => `#${h}`).join(' ');
      await navigator.clipboard.writeText(tagLine ? `${post.body}\n\n${tagLine}` : post.body);
      return toast('Copied');
    }

    if (e.target.closest('#dSave')) {
      await api.updatePost(post.id, {
        platform: $('#dPlatform').value,
        scheduledAt: new Date($('#dWhen').value).toISOString(),
        body: $('#dBody')?.value ?? post.body
      });
      toast('Saved');
      return reopen();
    }

    if (e.target.closest('#dDelete')) {
      await api.deletePost(post.id);
      closeDrawer();
      await refresh();
      paint(view);
      return toast('Slot deleted');
    }

    if (e.target.closest('#dPublish')) {
      await api.updatePost(post.id, { status: 'published', publishedAt: new Date().toISOString() });
      toast('Marked published');
      return reopen();
    }

    const gen = e.target.closest('#dGenerate');
    const rev2 = e.target.closest('#dReview');
    if (!gen && !rev2) return;

    const agent = gen
      ? { id: 'generation', name: 'Kavi', role: 'Generation', blurb: 'Generates personalized, platform-ready content' }
      : { id: 'reviewer', name: 'Neer', role: 'Reviewer', blurb: 'Reviews quality, accuracy, brand fit, safety' };
    const btn = gen || rev2;
    btn.disabled = true;
    $('#agentHost').innerHTML = stageCards([agent]);
    try {
      await streamInto(gen ? '/api/run/generate' : '/api/run/review', { id: post.id }, {
        onDone: async () => { toast(gen ? 'Draft written' : 'Reviewed'); await reopen(); },
        onFail: (m) => { toast(m); btn.disabled = false; }
      });
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
}

export default {
  async render(view) {
    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 05 · Calendar</p>
          <h1>Book the slots</h1>
          <p class="lede">Click any empty slot to book one, or open a planned piece to have Kavi
            write it and Neer review it before it goes out.</p>
        </div>
      </div>

      <div class="cal-bar">
        <button class="nav-btn" id="prev">‹</button>
        <button class="nav-btn" id="next">›</button>
        <button class="btn btn-ghost btn-sm" id="today">Today</button>
        <h2 class="cal-title" id="calTitle"></h2>
        <span class="spacer"></span>
        <div class="seg">
          <button data-mode="month" aria-pressed="${mode === 'month'}">Month</button>
          <button data-mode="week" aria-pressed="${mode === 'week'}">Week</button>
        </div>
      </div>
      <div id="calHost"></div>
      <div class="row" style="margin-top:14px;gap:14px">
        ${[['draft', 'Slot booked'], ['drafted', 'Written by Kavi'], ['reviewed', 'Reviewed by Neer'], ['published', 'Published']]
          .map(([k, label]) => `<span class="row" style="gap:6px"><span class="ev ${k}" style="width:14px;height:14px;padding:0"></span>
            <span style="font-size:.75rem;color:var(--ink-3)">${label}</span></span>`).join('')}
      </div>`;

    paint(view);

    view.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-mode]');
      if (m) {
        mode = m.dataset.mode;
        $$('[data-mode]', view).forEach((b) => b.setAttribute('aria-pressed', String(b === m)));
        return paint(view);
      }
      if (e.target.closest('#prev')) {
        mode === 'month' ? cursor.setMonth(cursor.getMonth() - 1) : cursor.setDate(cursor.getDate() - 7);
        return paint(view);
      }
      if (e.target.closest('#next')) {
        mode === 'month' ? cursor.setMonth(cursor.getMonth() + 1) : cursor.setDate(cursor.getDate() + 7);
        return paint(view);
      }
      if (e.target.closest('#today')) { cursor = new Date(); return paint(view); }

      const open = e.target.closest('[data-open]');
      if (open) {
        const post = ws.posts.find((p) => p.id === open.dataset.open);
        if (post) drawer(post, view);
        return;
      }

      const book = e.target.closest('[data-book]');
      if (!book) return;
      const when = new Date(book.dataset.book);
      // Month cells have no hour; default to the research-backed morning slot.
      if (mode === 'month') when.setHours(9, 30, 0, 0);
      const post = await api.createPost({
        title: 'New post', platform: ws.brand.platforms[0] || 'LinkedIn',
        format: 'single image', scheduledAt: when.toISOString(), status: 'draft'
      });
      await refresh();
      paint(view);
      drawer(post, view);
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  }
};
