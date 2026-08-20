// The agent stream UI: one card per agent, live tokens while it thinks, a
// rendered result when it lands. Shared by Strategy, Planning, Generate, Review.

import { $, esc, arr, tags, list, kv, block } from './ui.js';
import { runStream } from './api.js';

export function stageCards(agents) {
  return `<div class="stages">${agents.map((a, i) => `
    <article class="stage" id="stage-${a.id}" data-state="queued">
      <div class="node"><span>${String(i + 1).padStart(2, '0')}</span></div>
      <div>
        <div class="stage-head">
          <div>
            <p class="role">${esc(a.role)}</p>
            <h3 class="agent-name">${esc(a.name)}</h3>
            <p class="blurb">${esc(a.blurb)}</p>
          </div>
          <div class="meta" id="meta-${a.id}">queued</div>
        </div>
        <div id="body-${a.id}"></div>
      </div>
    </article>`).join('')}</div>`;
}

// Wires the standard event set; `extra` adds screen-specific handlers.
export function streamInto(path, body, { onDone, onFail, extra = {} } = {}) {
  const raw = {};
  return runStream(path, body, {
    stage_start: (d) => {
      raw[d.id] = '';
      const st = $(`#stage-${d.id}`);
      if (!st) return;
      st.dataset.state = 'running';
      $(`#meta-${d.id}`).textContent = 'thinking…';
      $(`#body-${d.id}`).innerHTML = `<div class="stream" id="stream-${d.id}"><span class="cursor"></span></div>`;
    },
    token: (d) => {
      raw[d.id] = (raw[d.id] || '') + d.t;
      const el = $(`#stream-${d.id}`);
      if (!el) return;
      el.textContent = raw[d.id].slice(-800);
      el.insertAdjacentHTML('beforeend', '<span class="cursor"></span>');
    },
    repair: (d) => { const m = $(`#meta-${d.id}`); if (m) m.textContent = 'reformatting…'; },
    rate_limited: (d) => {
      const m = $(`#meta-${d.id}`);
      if (!m) return;
      let left = d.secs;
      m.textContent = `rate limit · ${left}s`;
      const t = setInterval(() => {
        left -= 1;
        if (left <= 0 || !m.textContent.startsWith('rate limit')) return clearInterval(t);
        m.textContent = `rate limit · ${left}s`;
      }, 1000);
    },
    stage_done: (d) => {
      const st = $(`#stage-${d.id}`);
      if (!st) return;
      st.dataset.state = 'done';
      $(`#meta-${d.id}`).textContent = `${(d.ms / 1000).toFixed(1)}s${d.tokens ? ` · ${d.tokens} tok` : ''}`;
      $(`#body-${d.id}`).innerHTML = `<div class="result">${renderAgent(d.id, d.data)}</div>`;
    },
    failed: (d) => {
      if (d.id) {
        const st = $(`#stage-${d.id}`);
        if (st) {
          st.dataset.state = 'failed';
          $(`#meta-${d.id}`).textContent = 'failed';
        }
      }
      onFail?.(d.message);
    },
    done: (d) => onDone?.(d),
    ...extra
  });
}

// A model can always return a shape we didn't plan for; show the JSON rather
// than throwing out of the stream loop.
export function renderAgent(id, data) {
  try {
    return (RENDER[id] || RENDER.fallback)(data);
  } catch {
    return block('Raw output', `<div class="stream" style="max-height:190px;mask-image:none">${esc(JSON.stringify(data, null, 2))}</div>`);
  }
}

const RENDER = {
  onboard: (d) => [
    block('Positioning', `<p class="res-quote">${esc(d.positioning)}</p>`),
    block('Voice', tags(d.voice)),
    block('Audience', `<ul class="list">${arr(d.audience).map((a) =>
      `<li><b>${esc(a.segment)}</b> — ${esc(a.pain)}</li>`).join('')}</ul>`),
    block('Content pillars', tags(d.pillars, 'plain')),
    // "inferred" points are assumptions, not facts, and only "brief" ones are publishable.
    block('Proof points', `<ul class="list">${arr(d.proof_points).map((p) => {
      const claim = typeof p === 'string' ? p : p.claim;
      const src = typeof p === 'string' ? '' : String(p.source || '');
      return `<li>${esc(claim)}${src ? ` <span class="pill ${esc(src)}">${esc(src === 'brief' ? 'given' : 'assumed')}</span>` : ''}</li>`;
    }).join('')}</ul>`),
    block('Never do', list(d.never_do))
  ].join(''),

  research: (d) => [
    block('Trends', `<ul class="list">${arr(d.trends).map((t) =>
      `<li><b>${esc(t.signal)}</b> <span class="pill ${esc(t.confidence || 'low')}">${esc(t.confidence || 'low')}</span><br>${esc(t.why_now)}</li>`).join('')}</ul>`),
    block('Competitor angles', list(d.competitor_angles)),
    block('What the audience asks', list(d.audience_questions)),
    `<div class="grid g2">${kv('Best window', d.best_time?.window || '—')}${kv('Format call', d.format_recommendation || '—')}</div>`
  ].join(''),

  creative: (d) => [
    block('Big idea', `<p class="res-quote">${esc(d.big_idea)}</p>`),
    block('Angle', `<p style="font-size:.8125rem">${esc(d.angle)}</p>`),
    `<div class="grid g2">${kv('Call to action', d.cta || '—')}${kv('Pieces planned', arr(d.plan).length)}</div>`,
    block('Visual direction', `<p style="font-size:.8125rem">${esc(d.visual_direction)}</p>`)
  ].join(''),

  generation: (d) => [
    block('Draft', `<p style="font-size:.8125rem;white-space:pre-wrap">${esc(d.body)}</p>`),
    arr(d.hashtags).length ? block('Hashtags', tags(arr(d.hashtags).map((h) => `#${h}`))) : '',
    d.image_prompt ? block('Image prompt', `<p style="font-size:.8125rem">${esc(d.image_prompt)}</p>`) : ''
  ].join(''),

  reviewer: (d) => {
    const s = d.scores || {};
    return [
      `<div class="grid g4">${Object.entries(s).map(([k, v]) => `
        <div class="score">
          <div class="s-top"><span class="s-name">${esc(k.replace(/_/g, ' '))}</span><span class="s-val">${esc(v)}</span></div>
          <div class="meter"><i style="width:${Number(v) || 0}%"></i></div>
        </div>`).join('')}</div>`,
      d.summary ? block('Reviewer note', `<p style="font-size:.8125rem">${esc(d.summary)}</p>`) : '',
      arr(d.issues).length ? block('Flagged', `<ul class="list">${arr(d.issues).map((i) =>
        `<li><span class="pill ${esc(i.severity || 'low')}">${esc(i.severity || 'low')}</span> ${esc(i.note)}</li>`).join('')}</ul>`) : ''
    ].join('');
  },

  fallback: (d) => `<div class="stream" style="max-height:190px;mask-image:none">${esc(JSON.stringify(d, null, 2))}</div>`
};
