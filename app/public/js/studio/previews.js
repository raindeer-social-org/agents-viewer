/* previews.js — pixel-faithful, light-mode social post previews.
   Zero dependencies. Every icon is hand-written inline SVG.
   All markup is returned as an HTML string; all styling lives in
   /css/previews.css behind the `pv-` prefix. */

export const PLATFORMS = ['X', 'LinkedIn', 'Instagram', 'Threads', 'Facebook'];

const META = {
  X:         { name: 'X',         accent: '#1D9BF0', charLimit: 280,  handlePrefix: '@' },
  LinkedIn:  { name: 'LinkedIn',  accent: '#0A66C2', charLimit: 3000, handlePrefix: '' },
  Instagram: { name: 'Instagram', accent: '#E1306C', charLimit: 2200, handlePrefix: '@' },
  Threads:   { name: 'Threads',   accent: '#000000', charLimit: 500,  handlePrefix: '@' },
  Facebook:  { name: 'Facebook',  accent: '#1877F2', charLimit: 5000, handlePrefix: '@' }
};

export function platformMeta(platform) {
  const key = canon(platform);
  return { ...(META[key] || { name: String(platform || 'X'), accent: '#1D9BF0', charLimit: 280, handlePrefix: '@' }) };
}

/* ── plumbing ─────────────────────────────────────────────────── */

// Content comes from an LLM: escape absolutely everything that lands in markup.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function canon(platform) {
  const k = String(platform || '').trim().toLowerCase();
  return PLATFORMS.find((p) => p.toLowerCase() === k) || null;
}

const clean = (v) => String(v ?? '').trim();
const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
  .map((t) => clean(t).replace(/^#+/, '')).filter(Boolean);

// Engagement is never invented — it stays a visible placeholder.
const N = '—';

function truncate(text, max) {
  const t = String(text ?? '');
  if (t.length <= max) return { text: t, cut: false };
  let at = t.lastIndexOf(' ', max);
  if (at < max * 0.65) at = max;
  return { text: t.slice(0, at).replace(/\s+$/, ''), cut: true };
}

function hue(seed) {
  const s = String(seed || 'raindeer');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}

function norm(data) {
  const d = data || {};
  const brandName = clean(d.brandName) || 'Your Brand';
  return {
    brandName,
    handle: clean(d.handle).replace(/^@+/, '') || brandName.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    avatarLetter: (clean(d.avatarLetter) || brandName)[0].toUpperCase(),
    body: String(d.body ?? '').replace(/\r\n/g, '\n'),
    hashtags: list(d.hashtags),
    time: clean(d.time) || '2h',
    subtitle: clean(d.subtitle),
    imagePrompt: clean(d.imagePrompt),
    altText: clean(d.altText)
  };
}

/* ── icons — every one hand-drawn, no libraries ───────────────── */

const P = {
  reply:    '<path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.6L8 21.2V17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
  bubble:   '<path d="M20.7 3.3A11 11 0 0 0 3.4 16.6L2 22l5.5-1.4A11 11 0 1 0 20.7 3.3Z"/>',
  repost:   '<path d="M4.6 8.6V16a2.4 2.4 0 0 0 2.4 2.4h9"/><path d="M13.2 15.2 16 18.4l-2.8 3.2"/><path d="M19.4 15.4V8a2.4 2.4 0 0 0-2.4-2.4H8"/><path d="M10.8 8.8 8 5.6l2.8-3.2"/>',
  heart:    '<path d="M12 20.3l-1.1-1C5.4 14.4 2 11.3 2 7.6 2 4.6 4.4 2.2 7.4 2.2c1.7 0 3.3.8 4.6 2.1 1.3-1.3 2.9-2.1 4.6-2.1 3 0 5.4 2.4 5.4 5.4 0 3.7-3.4 6.8-8.9 11.7l-1.1 1Z"/>',
  views:    '<path d="M4 21v-8.4"/><path d="M9.3 21V3.4"/><path d="M14.7 21V8.6"/><path d="M20 21v-5"/>',
  bookmark: '<path d="M6 2.8h12a1 1 0 0 1 1 1V21l-7-4.9L5 21V3.8a1 1 0 0 1 1-1Z"/>',
  shareUp:  '<path d="M12 15.6V3.2"/><path d="M7.6 7.6 12 3.2l4.4 4.4"/><path d="M4.6 14v5.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V14"/>',
  send:     '<path d="M21.8 2.2 10.6 13.4"/><path d="M21.8 2.2 14.7 21.8l-4.1-8.4-8.4-4.1 19.6-7.1Z"/>',
  thumb:    '<path d="M7.2 21.4V9.6l4.6-7.2c1.3 0 2.3 1.2 2.1 2.5l-.8 4.3h5.3c1.4 0 2.5 1.3 2.2 2.7l-1.5 7.1a2.3 2.3 0 0 1-2.2 1.8H7.2Z"/><path d="M7.2 9.6H4.4A1.6 1.6 0 0 0 2.8 11.2v8.6a1.6 1.6 0 0 0 1.6 1.6h2.8"/>',
  fbshare:  '<path d="M13.4 4.2 21.6 11l-8.2 6.8v-3.7c-5 0-8.4 1.5-10.9 4.9.9-5.9 4.2-10.1 10.9-10.7V4.2Z"/>',
  globe:    '<path d="M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8Z"/><path d="M2.6 12h18.8"/><path d="M12 2.6c2.5 2.6 3.8 6 3.8 9.4S14.5 18.8 12 21.4C9.5 18.8 8.2 15.4 8.2 12S9.5 5.2 12 2.6Z"/>',
  image:    '<path d="M4.2 3.6h15.6a1.6 1.6 0 0 1 1.6 1.6v13.6a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V5.2a1.6 1.6 0 0 1 1.6-1.6Z"/><path d="M8.4 10.4a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"/><path d="m2.6 16.6 5-4.4 4.6 4 3.4-2.8 5.6 4.8"/>'
};

const SOLID = {
  verified: '<path fill="currentColor" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34Z"/><path fill="#fff" d="m10.65 16.4-3.4-3.4 1.42-1.42 1.98 1.98 4.68-4.68 1.42 1.42-6.1 6.1Z"/>',
  heart:    '<path fill="currentColor" d="M12 20.3l-1.1-1C5.4 14.4 2 11.3 2 7.6 2 4.6 4.4 2.2 7.4 2.2c1.7 0 3.3.8 4.6 2.1 1.3-1.3 2.9-2.1 4.6-2.1 3 0 5.4 2.4 5.4 5.4 0 3.7-3.4 6.8-8.9 11.7l-1.1 1Z"/>',
  thumb:    '<path fill="currentColor" d="M7.6 21.2V9.9l4.4-6.9c1.2 0 2.2 1.1 2 2.4l-.8 4.1h5.1c1.4 0 2.4 1.2 2.1 2.6l-1.4 6.8a2.2 2.2 0 0 1-2.1 1.7H7.6Z"/><path fill="currentColor" d="M6.2 9.9H3.6a1.5 1.5 0 0 0-1.5 1.5v8.3a1.5 1.5 0 0 0 1.5 1.5h2.6V9.9Z"/>',
  clap:     '<path fill="currentColor" d="M12 2.4 13.4 7l4.6 1.4L13.4 9.8 12 14.4 10.6 9.8 6 8.4 10.6 7 12 2.4Z"/><path fill="currentColor" d="m6.2 14 .8 2.6 2.6.8-2.6.8-.8 2.6-.8-2.6-2.6-.8 2.6-.8.8-2.6Z"/>',
  dots:     '<path fill="currentColor" d="M6 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Zm6 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Zm6 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z"/>'
};

function ico(name, size = 20, cls = '', sw = 1.7) {
  return `<svg class="pv-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" `
    + `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" `
    + `stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

function solid(name, size = 20, cls = '') {
  return `<svg class="pv-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" `
    + `aria-hidden="true" focusable="false">${SOLID[name] || ''}</svg>`;
}

/* ── shared pieces ────────────────────────────────────────────── */

function avatar(letter, cls) {
  return `<span class="pv-av ${cls}" aria-hidden="true">${esc(letter)}</span>`;
}

/* A placeholder — never a real image. Gradient + blueprint grid, hue derived
   from the image prompt so each brief gets its own consistent look. */
function media(prompt, altText, cls, shape = 'wide') {
  const p = clean(prompt);
  const neutral = !p;
  const h = hue(p || 'neutral');
  const bg = neutral
    ? 'linear-gradient(135deg,#EEF1F6 0%,#DFE5EE 52%,#CBD3E0 100%)'
    : `linear-gradient(135deg,hsl(${h} 72% 80%) 0%,hsl(${(h + 32) % 360} 64% 63%) 48%,`
      + `hsl(${(h + 68) % 360} 58% 47%) 100%)`;
  const label = neutral ? 'Media placeholder · 1:1' : p;
  return `<figure class="pv-media pv-media-${shape}${neutral ? ' pv-media-neutral' : ''} ${cls}" style="background-image:${bg}">
      <span class="pv-media-grid" aria-hidden="true"></span>
      <span class="pv-media-inner">
        <span class="pv-media-badge">${ico('image', 13, '', 1.9)}<span>${neutral ? 'No visual brief' : 'Visual brief'}</span></span>
        <span class="pv-media-prompt">${esc(label)}</span>
      </span>
      ${altText ? `<figcaption class="pv-media-alt"><span class="pv-media-alt-k">ALT</span>${esc(altText)}</figcaption>` : ''}
    </figure>`;
}

function tagLine(tags) {
  return tags.map((t) => `#${t}`).join(' ');
}

function charCount(text, tags, limit) {
  const line = tagLine(tags);
  return text.length + (line ? line.length + 1 : 0);
}

function counter(chars, limit) {
  const over = chars > limit;
  return `<p class="pv-count${over ? ' pv-count-over' : ''}">`
    + `<span class="pv-count-n">${chars}</span><span class="pv-count-s">/${limit}</span>`
    + `<span class="pv-count-l">${over ? 'over limit' : 'characters'}</span></p>`;
}

/* ── X ────────────────────────────────────────────────────────── */

function renderX(d) {
  const chars = charCount(d.body, d.hashtags, META.X.charLimit);
  const act = (name, cls, size = 18.5) =>
    `<span class="pv-x-act ${cls}"><span class="pv-x-ico">${ico(name, size, '', 1.7)}</span><span class="pv-x-n">${N}</span></span>`;

  return `<article class="pv pv-x" aria-label="X post preview">
    <div class="pv-x-card">
      <div class="pv-x-gut">${avatar(d.avatarLetter, 'pv-x-av')}</div>
      <div class="pv-x-main">
        <div class="pv-x-head">
          <span class="pv-x-name">${esc(d.brandName)}</span>
          <span class="pv-x-badge">${solid('verified', 16.5)}</span>
          <span class="pv-x-handle">@${esc(d.handle)}</span>
          <span class="pv-x-sep">·</span>
          <span class="pv-x-time">${esc(d.time)}</span>
          <span class="pv-x-dots">${solid('dots', 17)}</span>
        </div>
        <div class="pv-x-body">${esc(d.body)}</div>
        ${d.hashtags.length ? `<div class="pv-x-tags">${d.hashtags.map((t) => `<span class="pv-x-link">#${esc(t)}</span>`).join(' ')}</div>` : ''}
        ${d.imagePrompt ? media(d.imagePrompt, d.altText, 'pv-x-media', 'wide') : ''}
        <div class="pv-x-actions">
          ${act('reply', 'pv-x-reply')}
          ${act('repost', 'pv-x-repost')}
          ${act('heart', 'pv-x-like')}
          ${act('views', 'pv-x-views')}
          <span class="pv-x-tail">
            <span class="pv-x-act pv-x-save"><span class="pv-x-ico">${ico('bookmark', 18.5)}</span></span>
            <span class="pv-x-act pv-x-share"><span class="pv-x-ico">${ico('shareUp', 18.5)}</span></span>
          </span>
        </div>
      </div>
    </div>
    ${counter(chars, META.X.charLimit)}
  </article>`;
}

/* ── LinkedIn ─────────────────────────────────────────────────── */

function renderLinkedIn(d) {
  const { text, cut } = truncate(d.body, 240);
  const btn = (name, label) =>
    `<span class="pv-li-btn">${ico(name, 20, '', 1.6)}<span>${label}</span></span>`;

  return `<article class="pv pv-li" aria-label="LinkedIn post preview">
    <div class="pv-li-card">
      <div class="pv-li-head">
        ${avatar(d.avatarLetter, 'pv-li-av')}
        <div class="pv-li-id">
          <p class="pv-li-name">${esc(d.brandName)}<span class="pv-li-deg"> · 1st</span></p>
          ${d.subtitle ? `<p class="pv-li-sub">${esc(d.subtitle)}</p>` : ''}
          <p class="pv-li-meta">${esc(d.time)} · ${ico('globe', 13, 'pv-li-globe', 1.8)}</p>
        </div>
        <span class="pv-li-dots">${solid('dots', 20)}</span>
      </div>

      <div class="pv-li-body">${esc(text)}${cut ? `<span class="pv-li-ell">…</span><span class="pv-li-more">see more</span>` : ''}</div>
      ${d.hashtags.length ? `<div class="pv-li-tags">${d.hashtags.map((t) => `<span class="pv-li-link">#${esc(t)}</span>`).join(' ')}</div>` : ''}
      ${d.imagePrompt ? media(d.imagePrompt, d.altText, 'pv-li-media', 'wide') : ''}

      <div class="pv-li-social">
        <span class="pv-li-pills">
          <span class="pv-li-pill pv-li-pill-like">${solid('thumb', 10)}</span>
          <span class="pv-li-pill pv-li-pill-clap">${solid('clap', 10)}</span>
          <span class="pv-li-pill pv-li-pill-love">${solid('heart', 10)}</span>
        </span>
        <span class="pv-li-scount">${N}</span>
        <span class="pv-li-spacer"></span>
        <span class="pv-li-scount">${N} comments</span>
        <span class="pv-li-dot">·</span>
        <span class="pv-li-scount">${N} reposts</span>
      </div>

      <div class="pv-li-bar">
        ${btn('thumb', 'Like')}
        ${btn('reply', 'Comment')}
        ${btn('repost', 'Repost')}
        ${btn('send', 'Send')}
      </div>
    </div>
  </article>`;
}

/* ── Instagram ────────────────────────────────────────────────── */

function renderInstagram(d) {
  const caption = truncate(d.body, 125);
  return `<article class="pv pv-ig" aria-label="Instagram post preview">
    <div class="pv-ig-card">
      <div class="pv-ig-head">
        <span class="pv-ig-ring">${avatar(d.avatarLetter, 'pv-ig-av')}</span>
        <div class="pv-ig-id">
          <p class="pv-ig-user">${esc(d.handle)}</p>
          ${d.subtitle ? `<p class="pv-ig-loc">${esc(d.subtitle)}</p>` : ''}
        </div>
        <span class="pv-ig-dots">${solid('dots', 18)}</span>
      </div>

      ${media(d.imagePrompt, d.altText, 'pv-ig-media', 'square')}

      <div class="pv-ig-actions">
        <span class="pv-ig-left">
          <span class="pv-ig-act">${ico('heart', 24, '', 1.6)}</span>
          <span class="pv-ig-act">${ico('bubble', 24, '', 1.6)}</span>
          <span class="pv-ig-act">${ico('send', 24, '', 1.6)}</span>
        </span>
        <span class="pv-ig-act pv-ig-save">${ico('bookmark', 24, '', 1.6)}</span>
      </div>

      <p class="pv-ig-likes">Liked by <b>your community</b> and others</p>
      <p class="pv-ig-caption"><span class="pv-ig-cuser">${esc(d.handle)}</span> <span class="pv-ig-ctext">${esc(caption.text)}</span>${caption.cut ? `<span class="pv-ig-ell">…</span> <span class="pv-ig-more">more</span>` : ''}</p>
      ${d.hashtags.length ? `<p class="pv-ig-tags">${d.hashtags.map((t) => `<span class="pv-ig-link">#${esc(t)}</span>`).join(' ')}</p>` : ''}
      <p class="pv-ig-time">${esc(d.time)}</p>
    </div>
  </article>`;
}

/* ── Threads ──────────────────────────────────────────────────── */

function renderThreads(d) {
  const act = (name, size = 20) => `<span class="pv-th-act">${ico(name, size, '', 1.7)}</span>`;
  return `<article class="pv pv-th" aria-label="Threads post preview">
    <div class="pv-th-card">
      <div class="pv-th-gut">
        ${avatar(d.avatarLetter, 'pv-th-av')}
        <span class="pv-th-line" aria-hidden="true"></span>
      </div>
      <div class="pv-th-main">
        <div class="pv-th-head">
          <span class="pv-th-name">${esc(d.brandName)}</span>
          <span class="pv-th-badge">${solid('verified', 14)}</span>
          <span class="pv-th-spacer"></span>
          <span class="pv-th-time">${esc(d.time)}</span>
          <span class="pv-th-dots">${solid('dots', 16)}</span>
        </div>
        <div class="pv-th-body">${esc(d.body)}</div>
        ${d.hashtags.length ? `<div class="pv-th-tags">${d.hashtags.map((t) => `<span class="pv-th-link">#${esc(t)}</span>`).join(' ')}</div>` : ''}
        ${d.imagePrompt ? media(d.imagePrompt, d.altText, 'pv-th-media', 'wide') : ''}
        <div class="pv-th-actions">
          ${act('heart')}
          ${act('reply')}
          ${act('repost')}
          ${act('send')}
        </div>
        <p class="pv-th-foot">${N} replies<span class="pv-th-fdot">·</span>${N} likes</p>
      </div>
    </div>
  </article>`;
}

/* ── Facebook ─────────────────────────────────────────────────── */

function renderFacebook(d) {
  const { text, cut } = truncate(d.body, 340);
  const btn = (name, label, sw) =>
    `<span class="pv-fb-btn">${ico(name, 19, '', sw || 1.7)}<span>${label}</span></span>`;

  return `<article class="pv pv-fb" aria-label="Facebook post preview">
    <div class="pv-fb-card">
      <div class="pv-fb-head">
        ${avatar(d.avatarLetter, 'pv-fb-av')}
        <div class="pv-fb-id">
          <p class="pv-fb-name">${esc(d.brandName)}</p>
          <p class="pv-fb-meta">${esc(d.time)}<span class="pv-fb-dot">·</span>${ico('globe', 12, 'pv-fb-globe', 1.9)}</p>
        </div>
        <span class="pv-fb-dots">${solid('dots', 20)}</span>
      </div>

      <div class="pv-fb-body">${esc(text)}${cut ? `<span class="pv-fb-ell">… </span><span class="pv-fb-more">See more</span>` : ''}</div>
      ${d.hashtags.length ? `<div class="pv-fb-tags">${d.hashtags.map((t) => `<span class="pv-fb-link">#${esc(t)}</span>`).join(' ')}</div>` : ''}
      ${d.imagePrompt ? media(d.imagePrompt, d.altText, 'pv-fb-media', 'wide') : ''}

      <div class="pv-fb-social">
        <span class="pv-fb-pills">
          <span class="pv-fb-pill pv-fb-pill-like">${solid('thumb', 10)}</span>
          <span class="pv-fb-pill pv-fb-pill-love">${solid('heart', 10)}</span>
        </span>
        <span class="pv-fb-scount">${N}</span>
        <span class="pv-fb-spacer"></span>
        <span class="pv-fb-scount">${N} comments</span>
        <span class="pv-fb-dot">·</span>
        <span class="pv-fb-scount">${N} shares</span>
      </div>

      <div class="pv-fb-bar">
        ${btn('thumb', 'Like', 1.6)}
        ${btn('bubble', 'Comment', 1.7)}
        ${btn('fbshare', 'Share', 1.7)}
      </div>
    </div>
  </article>`;
}

/* ── entry point ──────────────────────────────────────────────── */

const RENDERERS = {
  X: renderX,
  LinkedIn: renderLinkedIn,
  Instagram: renderInstagram,
  Threads: renderThreads,
  Facebook: renderFacebook
};

export function renderPreview(platform, data) {
  const key = canon(platform) || 'X';
  return RENDERERS[key](norm(data));
}

export default { PLATFORMS, platformMeta, renderPreview };
