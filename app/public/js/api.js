// Server calls. Agent runs arrive as SSE over POST, so they're read with a
// stream reader rather than EventSource (which is GET-only).

const API_BASE_URL = window.location.hostname === 'localhost' ? '' : 'https://raindeer-backend.onrender.com'; // Replace with actual backend URL

const jsonReq = async (url, opts = {}) => {
  const r = await fetch(`${API_BASE_URL}${url}`, {
    headers: { 'content-type': 'application/json' }, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${url} → ${r.status}`);
  return r.json();
};

export const api = {
  health: () => jsonReq('/api/health'),
  models: () => jsonReq('/api/models'),
  workspace: () => jsonReq('/api/workspace'),
  patch: (body) => jsonReq('/api/workspace', { method: 'PATCH', body }),
  reset: () => jsonReq('/api/workspace', { method: 'DELETE' }),
  createPost: (body) => jsonReq('/api/posts', { method: 'POST', body }),
  updatePost: (id, body) => jsonReq(`/api/posts/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deletePost: (id) => jsonReq(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

// Streams an agent run. `handlers` maps SSE event names to callbacks.
export async function runStream(path, body, handlers) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`server responded ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop();
    for (const frame of frames) {
      const ev = frame.match(/^event: (.+)$/m)?.[1];
      const data = frame.match(/^data: ([\s\S]*)$/m)?.[1];
      if (!ev || !data) continue;
      try {
        handlers[ev]?.(JSON.parse(data));
      } catch (err) {
        console.error(`handler for "${ev}" failed`, err);
      }
    }
  }
}
