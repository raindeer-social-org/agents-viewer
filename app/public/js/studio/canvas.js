// An n8n-style infinite canvas: one transform layer, absolutely placed nodes,
// bezier edges underneath, and context you can watch travel along them.
// Zero dependencies. All styling lives in /css/canvas.css (every class is `cv-`).

const NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const STATES = ['idle', 'active', 'done', 'error'];
const DRAG_SLOP = 4;             // px of movement that turns a click into a drag
const PAD = 320;                 // svg breathing room around the node bounds

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 5);   // ≈ var(--ease-cinema)

function svg(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export function createCanvas(hostEl, options = {}) {
  if (!hostEl) throw new Error('createCanvas: hostEl is required');

  const onNodeClick = typeof options.onNodeClick === 'function' ? options.onNodeClick : null;
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  let dead = false;

  /* ── shell ─────────────────────────────────────────────────── */
  hostEl.classList.add('cv-root');
  hostEl.innerHTML = `
    <div class="cv-viewport">
      <div class="cv-layer"><div class="cv-grid"></div></div>
    </div>
    <div class="cv-tools">
      <button class="cv-tool" data-act="out" type="button" aria-label="Zoom out"><span class="cv-tool-icon">−</span></button>
      <button class="cv-tool" data-act="in" type="button" aria-label="Zoom in"><span class="cv-tool-icon">+</span></button>
      <i class="cv-tool-sep"></i>
      <button class="cv-tool cv-tool-text" data-act="fit" type="button">Fit</button>
      <button class="cv-tool cv-tool-text" data-act="reset" type="button">Reset</button>
      <span class="cv-zoom">100%</span>
    </div>
    <div class="cv-mini" title="Jump to area"><svg class="cv-mini-svg" aria-hidden="true"></svg></div>`;

  const viewport = hostEl.querySelector('.cv-viewport');
  const layer = hostEl.querySelector('.cv-layer');
  const tools = hostEl.querySelector('.cv-tools');
  const zoomLabel = hostEl.querySelector('.cv-zoom');
  const mini = hostEl.querySelector('.cv-mini');
  const miniSvg = hostEl.querySelector('.cv-mini-svg');

  const edgeSvg = svg('svg', { class: 'cv-edges' });
  layer.append(edgeSvg);

  /* ── model ─────────────────────────────────────────────────── */
  const nodes = new Map();
  for (const n of options.nodes || []) {
    const el = document.createElement('div');
    el.className = onNodeClick ? 'cv-node cv-clickable' : 'cv-node';
    el.dataset.id = n.id;
    el.dataset.state = 'idle';
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${n.w}px`;
    el.style.height = `${n.h}px`;
    el.innerHTML = '<div class="cv-node-body"></div>';
    layer.append(el);
    nodes.set(n.id, {
      id: n.id, x: n.x, y: n.y, w: n.w, h: n.h,
      el, body: el.querySelector('.cv-node-body'), mini: null
    });
  }

  const edges = [];
  for (const e of options.edges || []) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) continue;
    const g = svg('g', { class: 'cv-edge' });
    g.dataset.on = 'false';
    const d = edgeD(a, b);
    const line = svg('path', { class: 'cv-edge-line', d });
    const flow = svg('path', { class: 'cv-edge-flow', d });
    const p1 = svg('circle', { class: 'cv-port', cx: a.x + a.w, cy: a.y + a.h / 2, r: 3.5 });
    const p2 = svg('circle', { class: 'cv-port', cx: b.x, cy: b.y + b.h / 2, r: 3.5 });
    const dots = svg('g', { class: 'cv-particles' });
    g.append(line, flow, p1, p2, dots);
    edgeSvg.append(g);
    edges.push({ from: e.from, to: e.to, g, path: line, dots, on: false, len: 0, dur: 1400, parts: [] });
  }

  /* ── geometry ──────────────────────────────────────────────── */
  function edgeD(a, b) {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x, y2 = b.y + b.h / 2;
    const bow = Math.max(48, Math.abs(x2 - x1) * 0.55);
    return `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 - bow} ${y2}, ${x2} ${y2}`;
  }

  function bounds() {
    if (!nodes.size) return { x: 0, y: 0, w: 800, h: 500 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes.values()) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  const B = bounds();
  edgeSvg.setAttribute('viewBox', `${B.x - PAD} ${B.y - PAD} ${B.w + PAD * 2} ${B.h + PAD * 2}`);
  edgeSvg.setAttribute('width', B.w + PAD * 2);
  edgeSvg.setAttribute('height', B.h + PAD * 2);
  edgeSvg.style.left = `${B.x - PAD}px`;
  edgeSvg.style.top = `${B.y - PAD}px`;

  /* ── minimap ───────────────────────────────────────────────── */
  const MINI_W = 156, MINI_H = 96, MINI_PAD = 7;
  const miniK = Math.min(
    (MINI_W - MINI_PAD * 2) / Math.max(B.w, 1),
    (MINI_H - MINI_PAD * 2) / Math.max(B.h, 1)
  );
  const miniOX = (MINI_W - B.w * miniK) / 2 - B.x * miniK;
  const miniOY = (MINI_H - B.h * miniK) / 2 - B.y * miniK;
  const toMiniX = (wx) => wx * miniK + miniOX;
  const toMiniY = (wy) => wy * miniK + miniOY;

  miniSvg.setAttribute('width', MINI_W);
  miniSvg.setAttribute('height', MINI_H);
  miniSvg.setAttribute('viewBox', `0 0 ${MINI_W} ${MINI_H}`);
  const miniView = svg('rect', { class: 'cv-mini-view', rx: 2, x: 0, y: 0, width: 0, height: 0 });
  for (const n of nodes.values()) {
    const r = svg('rect', {
      class: 'cv-mini-node', rx: 1.5,
      x: toMiniX(n.x), y: toMiniY(n.y),
      width: Math.max(2, n.w * miniK), height: Math.max(2, n.h * miniK)
    });
    r.dataset.state = 'idle';
    n.mini = r;
    miniSvg.append(r);
  }
  miniSvg.append(miniView);

  /* ── view state ────────────────────────────────────────────── */
  const view = { x: 0, y: 0, k: 1 };
  let tween = null;
  let raf = 0;
  let overlayDirty = true;

  // Measured on the viewport, not the host, so a bordered/padded host still
  // anchors zoom exactly under the cursor.
  const size = () => {
    const r = viewport.getBoundingClientRect();
    return { w: r.width || hostEl.clientWidth || 1, h: r.height || hostEl.clientHeight || 1 };
  };

  function applyView() {
    layer.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`;
    overlayDirty = true;
    pump();
  }

  function drawOverlay() {
    const s = size();
    zoomLabel.textContent = `${Math.round(view.k * 100)}%`;
    const vx = -view.x / view.k, vy = -view.y / view.k;
    miniView.setAttribute('x', toMiniX(vx));
    miniView.setAttribute('y', toMiniY(vy));
    miniView.setAttribute('width', Math.max(3, (s.w / view.k) * miniK));
    miniView.setAttribute('height', Math.max(3, (s.h / view.k) * miniK));
  }

  /* ── animation loop (tween + particles + overlay) ──────────── */
  function pump() { if (!raf && !dead) raf = requestAnimationFrame(tick); }

  function tick(now) {
    raf = 0;
    if (dead) return;
    let alive = false;

    if (tween) {
      const t = clamp((now - tween.t0) / tween.dur, 0, 1);
      const e = easeOut(t);
      view.x = tween.fx + (tween.tx - tween.fx) * e;
      view.y = tween.fy + (tween.ty - tween.fy) * e;
      view.k = tween.fk + (tween.tk - tween.fk) * e;
      layer.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`;
      overlayDirty = true;
      if (t >= 1) tween = null; else alive = true;
    }

    let flowing = false;
    for (const e of edges) if (e.on && e.parts.length) { flowing = true; break; }
    if (flowing) { moveParticles(now); alive = true; }

    if (overlayDirty) { drawOverlay(); overlayDirty = false; }
    if (alive) raf = requestAnimationFrame(tick);
  }

  function moveParticles(now) {
    for (const e of edges) {
      if (!e.on || !e.parts.length) continue;
      const n = e.parts.length;
      for (let i = 0; i < n; i++) {
        const t = ((now / e.dur) + i / n) % 1;
        const p = e.path.getPointAtLength(t * e.len);
        e.parts[i].setAttribute('transform', `translate(${p.x} ${p.y})`);
        e.parts[i].style.opacity = Math.min(1, Math.sin(Math.PI * t) * 2.2).toFixed(3);
      }
    }
  }

  function animateTo(tx, ty, tk, dur = 460) {
    tk = clamp(tk, MIN_ZOOM, MAX_ZOOM);
    if (reduceMQ.matches || dur <= 0) {
      view.x = tx; view.y = ty; view.k = tk;
      applyView();
      return;
    }
    tween = {
      t0: performance.now(), dur,
      fx: view.x, fy: view.y, fk: view.k,
      tx, ty, tk
    };
    pump();
  }

  function centerOn(wx, wy, k = view.k, dur = 460) {
    const s = size();
    animateTo(s.w / 2 - wx * k, s.h / 2 - wy * k, k, dur);
  }

  function zoomAt(cx, cy, factor, dur = 0) {
    const r = viewport.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
    if (k === view.k) return;
    const wx = (px - view.x) / view.k;
    const wy = (py - view.y) / view.k;
    tween = null;
    if (dur > 0) animateTo(px - wx * k, py - wy * k, k, dur);
    else { view.x = px - wx * k; view.y = py - wy * k; view.k = k; applyView(); }
  }

  function fitView(dur = 460) {
    const s = size();
    const k = clamp(Math.min((s.w - 96) / Math.max(B.w, 1), (s.h - 96) / Math.max(B.h, 1)), MIN_ZOOM, MAX_ZOOM);
    const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    animateTo(s.w / 2 - cx * k, s.h / 2 - cy * k, k, dur);
  }

  /* ── pointer: pan + click ──────────────────────────────────── */
  let panning = false;
  let spaceHeld = false;
  let hovering = false;
  let start = null;

  viewport.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const nodeEl = ev.target.closest?.('.cv-node');
    const id = nodeEl?.dataset.id;
    start = { px: ev.clientX, py: ev.clientY, vx: view.x, vy: view.y, id, moved: false };
    if (!id || spaceHeld) {
      panning = true;
      tween = null;
      hostEl.dataset.panning = 'true';
    }
    viewport.setPointerCapture(ev.pointerId);
  }, sig);

  viewport.addEventListener('pointermove', (ev) => {
    if (!start) return;
    const dx = ev.clientX - start.px, dy = ev.clientY - start.py;
    if (!start.moved && Math.hypot(dx, dy) > DRAG_SLOP) start.moved = true;
    if (!panning) return;
    view.x = start.vx + dx;
    view.y = start.vy + dy;
    applyView();
  }, sig);

  function endPan(ev) {
    if (!start) return;
    const s = start;
    start = null;
    panning = false;
    delete hostEl.dataset.panning;
    if (viewport.hasPointerCapture?.(ev.pointerId)) viewport.releasePointerCapture(ev.pointerId);
    if (s.id && !s.moved && onNodeClick) onNodeClick(s.id);
  }
  viewport.addEventListener('pointerup', endPan, sig);
  viewport.addEventListener('pointercancel', endPan, sig);

  /* ── wheel zoom toward the cursor ──────────────────────────── */
  viewport.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {   // shift+wheel pans instead
      tween = null;
      view.x -= ev.deltaX || ev.deltaY;
      view.y -= ev.deltaX ? ev.deltaY : 0;
      applyView();
      return;
    }
    let dy = ev.deltaY;
    if (ev.deltaMode === 1) dy *= 16;        // lines → px
    else if (ev.deltaMode === 2) dy *= 400;  // pages → px
    const pinch = ev.ctrlKey || ev.metaKey;
    const factor = clamp(Math.exp(-dy * (pinch ? 0.01 : 0.0018)), 0.6, 1.7);
    zoomAt(ev.clientX, ev.clientY, factor);
  }, { passive: false, signal: ac.signal });

  /* ── space+drag, hover tracking ────────────────────────────── */
  hostEl.addEventListener('pointerenter', () => { hovering = true; }, sig);
  hostEl.addEventListener('pointerleave', () => { hovering = false; }, sig);

  window.addEventListener('keydown', (ev) => {
    if (ev.code !== 'Space' || !hovering) return;
    spaceHeld = true;
    hostEl.dataset.space = 'true';
    ev.preventDefault();
  }, sig);
  window.addEventListener('keyup', (ev) => {
    if (ev.code !== 'Space') return;
    spaceHeld = false;
    delete hostEl.dataset.space;
  }, sig);
  window.addEventListener('blur', () => {
    spaceHeld = false;
    delete hostEl.dataset.space;
  }, sig);

  /* ── toolbar + minimap ─────────────────────────────────────── */
  tools.addEventListener('click', (ev) => {
    const act = ev.target.closest('.cv-tool')?.dataset.act;
    if (!act) return;
    if (act === 'in') api.zoomBy(1.25);
    else if (act === 'out') api.zoomBy(0.8);
    else if (act === 'fit') fitView();
    else if (act === 'reset') api.resetView();
  }, sig);

  mini.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    const r = miniSvg.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) / r.width) * MINI_W;
    const my = ((ev.clientY - r.top) / r.height) * MINI_H;
    centerOn((mx - miniOX) / miniK, (my - miniOY) / miniK, view.k, 380);
  }, sig);

  const ro = new ResizeObserver(() => { overlayDirty = true; pump(); });
  ro.observe(hostEl);

  /* ── public API ────────────────────────────────────────────── */
  const api = {
    setNodeHTML(id, htmlString) {
      const n = nodes.get(id);
      if (!n || dead) return;
      n.body.innerHTML = htmlString ?? '';
    },

    setNodeState(id, state) {
      const n = nodes.get(id);
      if (!n || dead) return;
      const s = STATES.includes(state) ? state : 'idle';
      n.el.dataset.state = s;
      if (n.mini) n.mini.dataset.state = s;
    },

    pulseEdge(fromId, toId, on) {
      if (dead) return;
      const e = edges.find((x) => x.from === fromId && x.to === toId);
      if (!e) return;
      const want = !!on;
      if (e.on === want) return;
      e.on = want;
      e.g.dataset.on = String(want);
      if (want) {
        e.len = e.path.getTotalLength();
        e.dur = clamp(e.len * 5.4, 900, 2400);
        if (!reduceMQ.matches) {
          for (let i = 0; i < 3; i++) {
            const g = svg('g', { class: 'cv-particle' });
            g.append(svg('circle', { class: 'cv-particle-halo', r: 6 }));
            g.append(svg('circle', { class: 'cv-particle-core', r: 2.4 }));
            g.style.opacity = '0';
            e.dots.append(g);
            e.parts.push(g);
          }
        }
        pump();
      } else {
        for (const g of e.parts) g.remove();
        e.parts.length = 0;
      }
    },

    focus(id) {
      const n = nodes.get(id);
      if (!n || dead) return;
      centerOn(n.x + n.w / 2, n.y + n.h / 2, clamp(view.k, 0.85, 1.5), 520);
    },

    fit() { if (!dead) fitView(); },

    zoomBy(factor) {
      if (dead || !factor) return;
      const r = viewport.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor, 180);
    },

    resetView() {
      // 100% zoom with the graph's own origin parked at a comfortable margin.
      if (!dead) animateTo(48 - B.x, 48 - B.y, 1, 460);
    },

    getZoom() { return view.k; },

    destroy() {
      if (dead) return;
      dead = true;
      ac.abort();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      tween = null;
      nodes.clear();
      edges.length = 0;
      hostEl.classList.remove('cv-root');
      delete hostEl.dataset.panning;
      delete hostEl.dataset.space;
      hostEl.innerHTML = '';
    }
  };

  // Open on the whole graph, once the host has a measurable box.
  requestAnimationFrame(() => { if (!dead) fitView(0); });
  applyView();

  return api;
}
