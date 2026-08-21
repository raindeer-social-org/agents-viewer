// Router + rail. Screens are plain modules exporting { title, render }.

import { $, esc } from './ui.js';
import { boot, ws, health, progress, onChange } from './state.js';

import studio from './screens/studio.js';
import setup from './screens/setup.js';
import strategy from './screens/strategy.js';
import campaign from './screens/campaign.js';
import planning from './screens/planning.js';
import calendar from './screens/calendar.js';
import review from './screens/review.js';
import output from './screens/output.js';
import analytics from './screens/analytics.js';
import settings from './screens/settings.js';

export const SCREENS = [
  { id: 'studio', label: 'Studio', mod: studio, group: 'studio' },
  { id: 'setup', label: 'Setup', mod: setup, group: 'campaign' },
  { id: 'strategy', label: 'Strategy', mod: strategy, group: 'campaign' },
  { id: 'campaign', label: 'Campaign', mod: campaign, group: 'campaign' },
  { id: 'planning', label: 'Planning', mod: planning, group: 'campaign' },
  { id: 'calendar', label: 'Calendar', mod: calendar, group: 'dashboard' },
  { id: 'review', label: 'Review', mod: review, group: 'dashboard' },
  { id: 'output', label: 'Output', mod: output, group: 'dashboard' },
  { id: 'analytics', label: 'Analytics', mod: analytics, group: 'dashboard' },
  { id: 'settings', label: 'Settings', mod: settings, group: 'dashboard' }
];

const routeId = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'studio');
let current = null;

function renderRail() {
  const done = progress();
  const currentId = routeId();
  // Grouped for ordering and spacing only — the rail carries no section labels.
  const groups = ['studio', 'campaign', 'dashboard']
    .map((g) => SCREENS.filter((s) => s.group === g));
  $('#steps').innerHTML = groups.map((items, gi) => `
    <div class="steps-group${gi ? ' sep' : ''}">
    ${items.map((s, i) => {
      // Studio sits outside the numbered flow, so it gets a mark, not an index.
      const mark = s.group === 'studio'
        ? '\u2726'
        : String(s.group === 'campaign' ? i + 1 : SCREENS.findIndex((x) => x.id === s.id)).padStart(2, '0');
      return `<a class="step ${s.id === currentId ? 'active' : ''} ${done[s.id] ? 'done' : ''}" href="#/${s.id}">
        <span class="step-n"><span>${mark}</span></span>${esc(s.label)}</a>`;
    }).join('')}</div>`).join('');
}

function renderStatus() {
  const dot = $('#statusDot');
  const text = $('#statusText');
  dot.className = `dot ${health.key ? 'ok' : 'bad'}`;
  // Connection state only — the model name is a Settings concern, not a badge.
  text.textContent = health.key ? 'connected' : 'no groq key';
}

async function route() {
  const id = routeId();
  const screen = SCREENS.find((s) => s.id === id) || SCREENS[0];
  $('#crumb').innerHTML = `<b>${esc(screen.label)}</b>`;
  $('#topbarRight').innerHTML = '';
  renderRail();
  const view = $('#view');
  // Screens that hold resources (the canvas) get a chance to clean up.
  current?.mod.destroy?.();
  current = screen;
  view.className = 'view';
  view.innerHTML = '';
  try {
    await screen.mod.render(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="note err">This screen failed to render: ${esc(err.message)}</div>`;
  }
  window.scrollTo({ top: 0 });
}

/* ── rail open/close ──────────────────────────────────────────── */
// Remembered per browser so a demo picks up where it was left.
const RAIL_KEY = 'rd.rail.open';

function setRail(open) {
  document.body.classList.toggle('rail-closed', !open);
  $('#rail').inert = !open; // hidden links must not stay tabbable
  const btn = $('#railToggle');
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'Hide navigation' : 'Show navigation');
  try { localStorage.setItem(RAIL_KEY, open ? '1' : '0'); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('rail:toggle', { detail: { open } }));
}

const railOpen = () => !document.body.classList.contains('rail-closed');

$('#railToggle').addEventListener('click', () => setRail(!railOpen()));

// ⌘\ / ctrl+\ toggles, Escape closes — both skip while typing.
window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === '\\' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setRail(!railOpen()); }
  else if (e.key === 'Escape' && !typing && railOpen() && window.innerWidth <= 900) setRail(false);
});

setRail((() => { try { return localStorage.getItem(RAIL_KEY) !== '0'; } catch { return true; } })());

export function go(id) {
  if (routeId() === id) route();
  else location.hash = `#/${id}`;
}

window.addEventListener('hashchange', route);

boot().then(() => {
  onChange(() => { renderRail(); renderStatus(); });
  renderStatus();
  if (!location.hash) location.hash = '#/studio';
  route();
}).catch((err) => {
  $('#view').innerHTML = `<div class="note err">Could not reach the server: ${esc(err.message)}</div>`;
});
