// Client for the five-agent run. Streams SSE from /api/run, paints each agent
// as it thinks, then renders the publish-ready output.

const API_BASE_URL = window.location.hostname === 'localhost' ? '' : 'https://agents-viewer.onrender.com'; // Replace with actual backend URL

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const nl = (v) => esc(v).replace(/\\n/g, '\n');

const PLATFORMS = {
  LinkedIn:  { tag: 'in', bg: '#0A66C2', limit: 3000 },
  X:         { tag: 'X',  bg: '#0F1419', limit: 280 },
  Instagram: { tag: 'IG', bg: 'linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)', limit: 2200 },
  Threads:   { tag: '@',  bg: '#101010', limit: 500 },
  Facebook:  { tag: 'f',  bg: '#1877F2', limit: 5000 }
};
const pf = (name) => PLATFORMS[name] || { tag: (name || '?')[0], bg: 'var(--cobalt-600)', limit: 3000 };

const PRESETS = [
  {
    label: 'Slay Health',
    brand: 'Slay Health',
    website: 'slay.health',
    what: 'Preventive health testing for Indian professionals — full-body blood panels booked from a phone, sample collected at home, results read by a doctor within 24 hours.',
    audience: 'Working professionals, 25–40, metro India, first health scare or none yet',
    topic: 'Push preventive testing: most people under 30 have never had a full panel, and the first signal usually shows up years before symptoms.',
    tone: 'Warm and human',
    platforms: ['LinkedIn', 'Instagram']
  },
  {
    label: 'Hoblix',
    brand: 'Hoblix',
    website: 'hoblix.com',
    what: 'A community platform that turns hobbies into local meetups — discover people near you who do the thing you do, and actually show up.',
    audience: 'Urban 22–35 year olds who moved cities for work and lost their circle',
    topic: 'Announce that weekend meetups crossed a thousand sign-ups, and make the point that loneliness is a logistics problem, not a personality problem.',
    tone: 'Playful and irreverent',
    platforms: ['Instagram', 'X']
  },
  {
    label: 'raindeer.social',
    brand: 'raindeer.social',
    website: 'raindeer.social',
    what: 'An AI-powered social engine: a team of agents that researches trends, generates on-brand posts, and automates the publishing schedule for lean startups and agencies.',
    audience: 'Founders of SMBs and small agencies in India who cannot afford a ₹25K–₹1L/mo retainer',
    topic: 'Make the case that SMBs do not reject marketing — they defer it — and that deferring is what makes it expensive.',
    tone: 'Sharp and contrarian',
    platforms: ['LinkedIn', 'X']
  }
];

const form = $('#briefForm');
const stagesEl = $('#stages');
const outputEl = $('#output');
const runBtn = $('#runBtn');
const formNote = $('#formNote');
const runMeter = $('#runMeter');

let AGENTS = [];
let timer = null;

boot();

async function boot() {
  renderPresets();
  try {
    const h = await (await fetch(`${API_BASE_URL}/api/health`)).json();
    AGENTS = h.agents;
    renderStages('queued');
    const chip = $('.chip-live');
    chip.classList.add(h.key ? 'ok' : 'bad');
    $('#statusText').textContent = h.key ? `groq · ${h.model.split('/').pop()}` : 'no groq key';
    if (!h.key) {
      formNote.classList.add('err');
      formNote.textContent = 'Add GROQ_API_KEY to demo/.env, then restart the server.';
    }
    const models = (await (await fetch(`${API_BASE_URL}/api/models`)).json()).models;
    const sel = $('#modelSelect');
    sel.innerHTML = models.map((m) => `<option${m === h.model ? ' selected' : ''}>${esc(m)}</option>`).join('');
  } catch (e) {
    $('#statusText').textContent = 'server offline';
  }
}

function renderPresets() {
  $('#presets').innerHTML = PRESETS
    .map((p, i) => `<button type="button" class="preset" data-i="${i}">${esc(p.label)}</button>`).join('');
  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (!b) return;
    const p = PRESETS[Number(b.dataset.i)];
    for (const k of ['brand', 'website', 'what', 'audience', 'topic', 'tone']) form.elements[k].value = p[k];
    for (const cb of form.querySelectorAll('input[name=platforms]')) cb.checked = p.platforms.includes(cb.value);
  });
}

function renderStages(state) {
  stagesEl.innerHTML = AGENTS.map((a, i) => `
    <article class="stage" id="stage-${a.id}" data-state="${state}">
      <div class="node">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <div class="stage-head">
          <div>
            <p class="role">${esc(a.role)}</p>
            <h3 class="agent-name">${esc(a.name)}</h3>
            <p class="blurb">${esc(a.blurb)}</p>
          </div>
          <div class="stage-meta" id="meta-${a.id}">queued</div>
        </div>
        <div class="body" id="body-${a.id}"></div>
      </div>
    </article>`).join('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const platforms = fd.getAll('platforms');
  if (!platforms.length) {
    formNote.classList.add('err');
    formNote.textContent = 'Pick at least one platform.';
    return;
  }
  const brief = {
    brand: fd.get('brand').trim(),
    website: fd.get('website').trim(),
    what: fd.get('what').trim(),
    audience: fd.get('audience').trim(),
    topic: fd.get('topic').trim(),
    tone: fd.get('tone'),
    model: fd.get('model'),
    platforms
  };

  runBtn.disabled = true;
  $('.btn-label', runBtn).textContent = 'Team is working';
  formNote.classList.remove('err');
  formNote.textContent = 'Streaming from Groq…';
  outputEl.hidden = true;
  outputEl.innerHTML = '';
  renderStages('queued');
  startMeter();

  try {
    await stream(brief);
  } catch (err) {
    fail(null, err.message || String(err));
  } finally {
    stopMeter();
    runBtn.disabled = false;
    $('.btn-label', runBtn).textContent = 'Deploy the team';
  }
});

function startMeter() {
  const t0 = Date.now();
  runMeter.hidden = false;
  timer = setInterval(() => {
    runMeter.textContent = `running · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
  }, 100);
}
function stopMeter() { clearInterval(timer); }

async function stream(brief) {
  const res = await fetch(`${API_BASE_URL}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(brief)
  });
  if (!res.ok) throw new Error(`server responded ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const raw = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop();
    for (const frame of frames) {
      const ev = frame.match(/^event: (.+)$/m)?.[1];
      const dataLine = frame.match(/^data: ([\s\S]*)$/m)?.[1];
      if (!ev || !dataLine) continue;
      const d = JSON.parse(dataLine);

      if (ev === 'stage_start') {
        raw[d.id] = '';
        const st = $(`#stage-${d.id}`);
        st.dataset.state = 'running';
        $(`#meta-${d.id}`).textContent = 'thinking…';
        $(`#body-${d.id}`).innerHTML = `<div class="stream" id="stream-${d.id}"><span class="cursor"></span></div>`;
        st.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (ev === 'token') {
        raw[d.id] += d.t;
        const el = $(`#stream-${d.id}`);
        if (el) {
          el.textContent = raw[d.id].slice(-900);
          el.insertAdjacentHTML('beforeend', '<span class="cursor"></span>');
        }
      }

      if (ev === 'repair') $(`#meta-${d.id}`).textContent = 'reformatting…';

      if (ev === 'rate_limited') {
        let left = d.secs;
        const meta = $(`#meta-${d.id}`);
        meta.textContent = `rate limit · resuming in ${left}s`;
        const tick = setInterval(() => {
          left -= 1;
          if (left <= 0 || !meta.textContent.startsWith('rate limit')) return clearInterval(tick);
          meta.textContent = `rate limit · resuming in ${left}s`;
        }, 1000);
      }

      if (ev === 'stage_done') {
        const st = $(`#stage-${d.id}`);
        st.dataset.state = 'done';
        $(`#meta-${d.id}`).textContent =
          `${(d.ms / 1000).toFixed(1)}s${d.tokens ? ` · ${d.tokens} tok` : ''}`;
        $(`#body-${d.id}`).innerHTML = `<div class="result">${renderStage(d)}</div>`;
      }

      if (ev === 'failed') fail(d.id, d.message);
      if (ev === 'done') {
        // Never let a render slip take the whole run down mid-pitch.
        try { renderOutput(d, brief); } catch (err) { fail(null, `Could not render output: ${err.message}`); }
      }
    }
  }
}

function fail(id, message) {
  if (id) {
    $(`#stage-${id}`).dataset.state = 'failed';
    $(`#meta-${id}`).textContent = 'failed';
    $(`#body-${id}`).innerHTML = `<div class="error-note">${esc(message)}</div>`;
  }
  formNote.classList.add('err');
  formNote.textContent = message;
}

/* ── per-agent result renderers ─────────────────────────────── */

const block = (label, inner) =>
  `<div class="res-block"><span class="res-label">${esc(label)}</span>${inner}</div>`;
const tags = (items, cls = '') =>
  `<div class="tags">${arr(items).map((t) => `<span class="tag ${cls}">${esc(t)}</span>`).join('')}</div>`;
const list = (items) =>
  `<ul class="list">${arr(items).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const mini = (k, v) => `<div class="mini-card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;

// A model can always hand back a shape we didn't plan for; show the JSON
// rather than throwing out of the stream loop.
function renderStage(d) {
  try {
    return RENDER[d.id](d.data);
  } catch {
    return block('Raw output', `<div class="stream" style="max-height:200px;mask-image:none">${esc(JSON.stringify(d.data, null, 2))}</div>`);
  }
}

const RENDER = {
  onboard: (d) => [
    block('Positioning', `<p class="res-quote">${esc(d.positioning)}</p>`),
    block('Voice', tags(d.voice)),
    block('Audience', `<ul class="list">${arr(d.audience).map((a) =>
      `<li><b>${esc(a.segment)}</b> — ${esc(a.pain)}</li>`).join('')}</ul>`),
    block('Content pillars', tags(d.pillars, 'plain')),
    // "inferred" points are assumptions, not facts — the whole run downstream
    // depends on that line staying visible.
    block('Proof points', `<ul class="list">${arr(d.proof_points).map((p) => {
      const claim = typeof p === 'string' ? p : p.claim;
      const src = typeof p === 'string' ? '' : String(p.source || '');
      return `<li>${esc(claim)}${src ? `<span class="conf ${src === 'brief' ? 'high' : 'medium'}">${
        esc(src === 'brief' ? 'given' : 'assumed')}</span>` : ''}</li>`;
    }).join('')}</ul>`),
    block('Never do', list(d.never_do))
  ].join(''),

  research: (d) => [
    block('Trends', `<ul class="list">${arr(d.trends).map((t) =>
      `<li><b>${esc(t.signal)}</b><span class="conf ${esc(t.confidence || 'low')}">${esc(t.confidence || 'low')}</span><br>${esc(t.why_now)}</li>`).join('')}</ul>`),
    block('Competitor angles', list(d.competitor_angles)),
    block('What the audience is asking', list(d.audience_questions)),
    `<div class="grid2">${mini('Best window', d.best_time?.window || '—')}${mini('Format call', d.format_recommendation || '—')}</div>`,
    d.best_time?.rationale ? block('Why then', `<p class="res-text">${esc(d.best_time.rationale)}</p>`) : ''
  ].join(''),

  creative: (d) => [
    block('Big idea', `<p class="res-quote">${esc(d.big_idea)}</p>`),
    block('Angle', `<p class="res-text">${esc(d.angle)}</p>`),
    block('Hooks in contention', list(d.hooks)),
    `<div class="grid2">${mini('Format', d.format || '—')}${mini('Call to action', d.cta || '—')}</div>`,
    block('Visual direction', `<p class="res-text">${esc(d.visual_direction)}</p>`)
  ].join(''),

  generation: (d) => [
    block('Drafts written', tags(arr(d.posts).map((p) => p.platform))),
    block('Image prompt', `<p class="res-text">${esc(d.image_prompt)}</p>`),
    d.alt_text ? block('Alt text', `<p class="res-text">${esc(d.alt_text)}</p>`) : ''
  ].join(''),

  reviewer: (d) => {
    const s = d.scores || {};
    const avg = Math.round(Object.values(s).reduce((a, b) => a + Number(b || 0), 0) / (Object.keys(s).length || 1));
    return [
      `<div class="grid2">${mini('Verdict', String(d.verdict || '').replace('_', ' '))}${mini('Average score', `${avg}/100`)}</div>`,
      d.summary ? block('Reviewer note', `<p class="res-text">${esc(d.summary)}</p>`) : '',
      arr(d.issues).length ? block('Flagged', `<ul class="list">${arr(d.issues).map((i) =>
        `<li><b>${esc(i.severity)}</b> — ${esc(i.note)}</li>`).join('')}</ul>`) : ''
    ].join('');
  }
};

/* ── final publish-ready output ─────────────────────────────── */

function renderOutput({ receipt, totalMs, result }, brief) {
  const rev = result.reviewer || {};
  const gen = result.generation || {};
  const posts = (arr(rev.final_posts).length ? rev.final_posts : arr(gen.posts));
  const scores = rev.scores || {};
  const verdict = String(rev.verdict || 'approve');
  const totalTokens = receipt.reduce((a, r) => a + (r.tokens || 0), 0);

  outputEl.innerHTML = `
    <div class="out-head">
      <div>
        <p class="eyebrow"><span class="rule"></span>Ready for human review</p>
        <h2>${esc(brief.brand)} — ${posts.length} post${posts.length === 1 ? '' : 's'}, reviewed and publish-ready</h2>
      </div>
      <span class="verdict ${esc(verdict)}">${esc(verdict.replace('_', ' '))}</span>
    </div>

    ${Object.keys(scores).length ? `<div class="scorecard">${Object.entries(scores).map(([k, v]) => `
      <div class="score">
        <div class="s-top"><span class="s-name">${esc(k.replace(/_/g, ' '))}</span><span class="s-val">${esc(v)}</span></div>
        <div class="meter"><i data-w="${Number(v) || 0}"></i></div>
      </div>`).join('')}</div>` : ''}

    <div class="posts">${posts.map((p) => postCard(p, brief)).join('')}</div>

    ${arr(rev.issues).length ? `<div class="issues">
      <span class="res-label">Reviewer flags — ${esc(rev.summary || '')}</span>
      ${arr(rev.issues).map((i) => `<div class="issue">
        <span class="sev ${esc(i.severity || 'low')}">${esc(i.severity || 'low')}</span>
        <span>${esc(i.note)}</span></div>`).join('')}
    </div>` : ''}

    <div class="receipt">
      <div class="r-row">
        <div class="r-item"><span class="k">Wall clock</span><span class="v">${(totalMs / 1000).toFixed(1)}s</span></div>
        <div class="r-item"><span class="k">Agents run</span><span class="v">${receipt.length}</span></div>
        <div class="r-item"><span class="k">Tokens</span><span class="v">${totalTokens || '—'}</span></div>
        <div class="r-item"><span class="k">Model</span><span class="v" style="font-size:.95rem">${esc(brief.model)}</span></div>
        <div class="r-item"><span class="k">Human decisions</span><span class="v">1</span></div>
      </div>
      <div class="r-split"></div>
      <div class="r-agents">${receipt.map((r) =>
        `<span class="r-agent"><b>${esc(r.name)}</b> · ${esc(r.role)} · ${(r.ms / 1000).toFixed(1)}s</span>`).join('')}</div>
    </div>`;

  outputEl.hidden = false;
  requestAnimationFrame(() => {
    outputEl.querySelectorAll('.meter i').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
  });
  outputEl.querySelectorAll('.copy').forEach((btn) => btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(btn.dataset.text);
    btn.classList.add('done');
    btn.textContent = 'copied';
    setTimeout(() => { btn.classList.remove('done'); btn.textContent = 'copy'; }, 1600);
  }));
  outputEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  formNote.textContent = `Done in ${(totalMs / 1000).toFixed(1)}s across ${receipt.length} agents.`;
}

function postCard(p, brief) {
  const meta = pf(p.platform);
  const hashtags = arr(p.hashtags).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const body = String(p.body || '');
  const chars = body.length + (hashtags ? hashtags.length + 1 : 0);
  const over = chars > meta.limit;
  const full = hashtags ? `${body}\n\n${hashtags}` : body;
  return `
    <article class="post">
      <div class="post-top">
        <span class="platform"><span class="pf-dot" style="background:${meta.bg}">${esc(meta.tag)}</span>${esc(p.platform)}</span>
        <button class="copy" data-text="${esc(full)}">copy</button>
      </div>
      <div class="post-author">
        <div class="avatar">${esc((brief.brand || 'R')[0].toUpperCase())}</div>
        <div>
          <div class="author-name">${esc(brief.brand)}</div>
          <div class="author-sub">sponsored by raindeer</div>
        </div>
      </div>
      <div class="post-body">${nl(body)}</div>
      ${hashtags ? `<div class="post-tags">${esc(hashtags)}</div>` : ''}
      <div class="post-foot">
        <span class="${over ? 'over' : ''}">${chars} / ${meta.limit} chars</span>
        <span>${arr(p.hashtags).length} tags</span>
        <span>reviewed by Neer</span>
      </div>
    </article>`;
}
