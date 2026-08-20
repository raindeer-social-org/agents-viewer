// Small render helpers shared by every screen. No framework, no build step.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// Real platform marks, hand-drawn as inline SVG — no icon library, no remote
// assets. Each renders white-on-brand inside a rounded tile.
const GLYPH = {
  X: '<path d="M13.6 10.6 21.1 2h-1.8l-6.5 7.5L7.6 2H1.6l7.9 11.4L1.6 22h1.8l6.9-7.9 5.5 7.9h6zM11.2 13.4l-.8-1.1L4 3.4h2.7l5.1 7.3.8 1.1 6.6 9.5h-2.7z"/>',
  LinkedIn: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5M2.4 21h5.2V9.2H2.4zm7.5 0h5.2v-6.4c0-1.7.3-3.3 2.4-3.3s2.1 1.9 2.1 3.4V21h5.2v-7.3c0-4.4-1-7.8-6.1-7.8-2.5 0-4.1 1.3-4.8 2.6h-.1V9.2H9.9z"/>',
  Instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.22 1 .48 1.4.9.43.42.7.82.92 1.4.17.42.37 1.05.42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.22.6-.5 1-.92 1.4-.42.43-.82.7-1.4.92-.42.17-1.05.37-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.22-1-.5-1.4-.92-.43-.42-.7-.82-.92-1.4-.17-.42-.37-1.05-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.22-.6.5-1 .92-1.4.42-.43.82-.7 1.4-.92.42-.17 1.05-.37 2.2-.42C8.4 2.2 8.8 2.2 12 2.2m0 2.15c-3.15 0-3.5.01-4.75.07-1.15.05-1.77.24-2.18.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.41-.35 1.03-.4 2.18-.06 1.25-.07 1.6-.07 4.75s.01 3.5.07 4.75c.05 1.15.24 1.77.4 2.18.22.55.47.94.88 1.35.41.41.8.66 1.35.88.41.16 1.03.35 2.18.4 1.25.06 1.6.07 4.75.07s3.5-.01 4.75-.07c1.15-.05 1.77-.24 2.18-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.41.35-1.03.4-2.18.06-1.25.07-1.6.07-4.75s-.01-3.5-.07-4.75c-.05-1.15-.24-1.77-.4-2.18a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.18-.4-1.25-.06-1.6-.07-4.75-.07"/><path d="M12 6.87a5.13 5.13 0 1 0 0 10.26 5.13 5.13 0 0 0 0-10.26m0 8.46a3.33 3.33 0 1 1 0-6.66 3.33 3.33 0 0 1 0 6.66"/><circle cx="17.34" cy="6.66" r="1.2"/>',
  Threads: '<path d="M16.2 11.3q-.14-.07-.29-.13c-.17-3.1-1.86-4.87-4.7-4.89h-.04c-1.7 0-3.11.72-3.99 2.04l1.56 1.07c.65-.99 1.68-1.2 2.43-1.2h.03c.93.01 1.63.28 2.08.8.33.38.55.9.66 1.57a12 12 0 0 0-2.66-.13c-2.68.15-4.4 1.71-4.29 3.88.06 1.1.61 2.05 1.55 2.67.79.52 1.81.78 2.87.72 1.4-.08 2.5-.61 3.26-1.59.58-.74.95-1.7 1.11-2.91.68.41 1.18.95 1.46 1.6.47 1.11.5 2.93-.98 4.41-1.3 1.3-2.86 1.86-5.22 1.88-2.62-.02-4.6-.86-5.88-2.5C4.98 16.53 4.36 14.4 4.34 12s.62-4.53 1.84-6.07C7.46 4.29 9.44 3.45 12.06 3.43c2.64.02 4.65.86 5.98 2.51.65.81 1.14 1.83 1.47 3.02l1.83-.49c-.4-1.46-1.02-2.72-1.86-3.76C17.78 2.6 15.28 1.5 12.07 1.48h-.01c-3.2.02-5.68 1.12-7.35 3.25C3.22 6.63 2.46 9.14 2.44 12v.01c.02 2.85.78 5.36 2.27 7.26 1.67 2.13 4.15 3.22 7.35 3.25h.01c2.85-.02 4.85-.77 6.5-2.42 2.16-2.16 2.1-4.86 1.39-6.52-.51-1.19-1.48-2.16-2.8-2.79zm-4.94 4.62c-1.17.07-2.39-.46-2.45-1.6-.05-.84.6-1.79 2.53-1.9l.4-.01c.7 0 1.36.07 1.95.2-.22 2.75-1.51 3.25-2.43 3.3z"/>',
  Facebook: '<path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.92 3.77-3.92 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.9h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94"/>'
};

export const PLATFORMS = {
  LinkedIn:  { tag: 'in', bg: '#0A66C2', limit: 3000 },
  X:         { tag: 'X',  bg: '#000000', limit: 280 },
  Instagram: { tag: 'IG', bg: 'linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)', limit: 2200 },
  Threads:   { tag: '@',  bg: '#000000', limit: 500 },
  Facebook:  { tag: 'f',  bg: '#1877F2', limit: 5000 }
};
export const pf = (name) => PLATFORMS[name] || { tag: String(name || '?')[0], bg: 'var(--cobalt-600)', limit: 3000 };

export const pfBadge = (name) => {
  const meta = pf(name);
  const glyph = GLYPH[name];
  return `<span class="pf" style="background:${meta.bg}">${glyph
    ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${glyph}</svg>`
    : esc(meta.tag)}</span>`;
};

export const tags = (items, cls = '') =>
  `<div class="tags">${arr(items).map((t) => `<span class="tag ${cls}">${esc(t)}</span>`).join('')}</div>`;

export const list = (items) =>
  `<ul class="list">${arr(items).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

export const kv = (k, v) => `<div class="kv"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;

export const block = (label, inner) => `<div><span class="res-label">${esc(label)}</span>${inner}</div>`;

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

export const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) =>
  new Date(d).toLocaleDateString('en-IN', opts);

export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Local YYYY-MM-DDTHH:mm for <input type="datetime-local">, which has no UTC.
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function chipGroup(name, options, current, multi = false) {
  const sel = multi ? arr(current) : [current];
  return `<div class="chips" data-chips="${esc(name)}" data-multi="${multi}">${options.map((o) =>
    `<button type="button" class="chip" data-value="${esc(o)}" aria-pressed="${sel.includes(o)}">${esc(o)}</button>`
  ).join('')}</div>`;
}

// One delegated listener drives every chip group on a screen.
export function wireChips(root, onChange) {
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const group = chip.closest('[data-chips]');
    if (!group) return;
    const multi = group.dataset.multi === 'true';
    if (multi) {
      const on = chip.getAttribute('aria-pressed') === 'true';
      const others = $$('.chip[aria-pressed="true"]', group).length;
      if (on && others === 1) return; // never let the last one off
      chip.setAttribute('aria-pressed', String(!on));
    } else {
      $$('.chip', group).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    }
    const values = $$('.chip[aria-pressed="true"]', group).map((c) => c.dataset.value);
    onChange(group.dataset.chips, multi ? values : values[0]);
  });
}
