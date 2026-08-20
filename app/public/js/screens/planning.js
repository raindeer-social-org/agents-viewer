// Step 4 — Keshav picks the big idea and lays the campaign out as dated slots,
// which land straight on the calendar.

import { $, esc, arr, toast, pfBadge, fmtDate, fmtTime } from '../ui.js';
import { ws, health, refresh } from '../state.js';
import { stageCards, streamInto, renderAgent } from '../pipeline.js';
import { go } from '../app.js';

const AGENTS = [{
  id: 'creative', name: 'Keshav', role: 'Creative',
  blurb: 'Defines creative direction, formats, hooks, visuals, and platform strategy'
}];

function planTable(plan, posts) {
  const byKey = new Map(posts.map((p) => [p.planKey, p]));
  return `<div class="card"><p class="card-title">The plan — ${arr(plan).length} pieces</p>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>#</th><th>Piece</th><th>Hook</th><th>Platform</th><th>Format</th><th>Scheduled</th></tr></thead>
      <tbody>${arr(plan).map((p, i) => {
        const post = byKey.get(`plan-${i}`);
        return `<tr>
          <td class="mono" style="color:var(--ink-4)">${String(i + 1).padStart(2, '0')}</td>
          <td><b style="color:var(--ink)">${esc(p.title)}</b></td>
          <td style="max-width:280px">${esc(p.hook)}</td>
          <td><span class="row" style="gap:6px;flex-wrap:nowrap">${pfBadge(p.platform)}${esc(p.platform)}</span></td>
          <td>${esc(p.format)}</td>
          <td class="mono" style="font-size:.6875rem;white-space:nowrap">${post
            ? `${esc(fmtDate(post.scheduledAt))} · ${esc(fmtTime(post.scheduledAt))}`
            : `day ${esc(p.day)} · ${esc(p.time)}`}</td>
        </tr>`;
      }).join('')}</tbody></table></div></div>`;
}

export default {
  async render(view) {
    const ready = Boolean(ws.strategy) && Boolean(ws.campaign.message);
    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 04 · Creative</p>
          <h1>Plan the campaign</h1>
          <p class="lede">Keshav commits to one big idea, then spreads ${esc(ws.campaign.pieces)}
            pieces across ${esc(ws.campaign.duration)} days and books each one a slot.</p>
        </div>
        <div class="row">
          ${ready ? `<button class="btn btn-primary" id="run">
            ${ws.planning ? 'Re-plan' : 'Plan the campaign'} <span class="arr">→</span></button>` : ''}
          ${ws.planning ? '<button class="btn btn-ghost" id="next">Open the calendar</button>' : ''}
        </div>
      </div>
      ${!health.key ? '<div class="note err">No Groq key loaded. Add GROQ_API_KEY to app/.env and restart.</div>' : ''}
      ${!ready ? `<div class="empty"><h3>Not ready yet</h3>
          Keshav plans from the Brand Brain and a core message.
          <div class="row" style="justify-content:center;margin-top:14px">
            <a class="btn btn-ghost btn-sm" href="#/strategy">Run strategy</a>
            <a class="btn btn-ghost btn-sm" href="#/campaign">Set the message</a></div></div>`
      : `<div id="stagesHost">${stageCards(AGENTS)}</div>
         <div id="planHost" style="margin-top:14px">${ws.planning ? planTable(ws.planning.plan, ws.posts) : ''}</div>`}`;

    if (ws.planning) {
      const st = $('#stage-creative', view);
      if (st) {
        st.dataset.state = 'done';
        $('#meta-creative', view).textContent = 'saved';
        $('#body-creative', view).innerHTML = `<div class="result">${renderAgent('creative', ws.planning)}</div>`;
      }
    }

    view.addEventListener('click', async (e) => {
      if (e.target.closest('#next')) return go('calendar');
      const btn = e.target.closest('#run');
      if (!btn) return;

      btn.disabled = true;
      btn.textContent = 'Keshav is planning';
      $('#stagesHost', view).innerHTML = stageCards(AGENTS);
      try {
        await streamInto('/api/run/planning', {}, {
          onDone: async (d) => {
            await refresh();
            $('#planHost', view).innerHTML = planTable(d.planning?.plan, d.posts || []);
            toast(`${arr(d.planning?.plan).length} slots booked`);
          },
          onFail: (m) => toast(m)
        });
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Re-plan <span class="arr">→</span>';
      }
    });
  }
};
