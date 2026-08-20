// The workspace mirrors the server's store. Screens read `ws`, mutate through
// `save`, and re-render on `changed`.

import { api } from './api.js';

export let ws = null;
export let health = { key: false, model: '', agents: [] };

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(ws));

export async function boot() {
  const [h, w] = await Promise.all([api.health(), api.workspace()]);
  health = h;
  ws = w;
  emit();
  return ws;
}

export async function save(section, values) {
  ws = await api.patch({ [section]: values });
  emit();
  return ws;
}

export async function refresh() {
  ws = await api.workspace();
  emit();
  return ws;
}

export function setLocal(next) {
  ws = next;
  emit();
}

// Which steps are complete — drives the rail ticks and the guards.
export function progress() {
  const b = ws?.brand || {};
  const posts = ws?.posts || [];
  return {
    studio: Boolean(ws?.runs?.some((r) => r.agent === 'reviewer')),
    setup: Boolean(b.name && b.what),
    strategy: Boolean(ws?.strategy),
    campaign: Boolean(ws?.campaign?.message),
    planning: Boolean(ws?.planning),
    calendar: posts.length > 0,
    review: posts.some((p) => p.review),
    output: posts.some((p) => p.status === 'published'),
    analytics: posts.some((p) => p.status === 'published')
  };
}
