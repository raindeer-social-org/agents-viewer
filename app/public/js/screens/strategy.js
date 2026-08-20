// Step 2 — Aarav and Ved run back to back and produce the Brand Brain plus
// the research read that every later agent quotes from.

import { $, esc, toast } from '../ui.js';
import { ws, health, refresh } from '../state.js';
import { stageCards, streamInto, renderAgent } from '../pipeline.js';
import { go } from '../app.js';

const AGENTS = [
  { id: 'onboard', name: 'Aarav', role: 'On Board', blurb: 'Learns brand identity, goals, audience, voice, history, and positioning' },
  { id: 'research', name: 'Ved', role: 'Research', blurb: 'Researches markets, competitors, trends, audiences, and platform behavior' }
];

export default {
  async render(view) {
    const ready = Boolean(ws.brand.name && ws.brand.what);
    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 02 · On Board + Research</p>
          <h1>Build the Brand Brain</h1>
          <p class="lede">Aarav turns the setup into a structured brand model. Ved reads it and
            comes back with what is moving in this market right now.</p>
        </div>
        <div class="row">
          ${ready ? `<button class="btn btn-primary" id="run">
            ${ws.strategy ? 'Run again' : 'Run strategy'} <span class="arr">→</span></button>` : ''}
          ${ws.strategy ? '<button class="btn btn-ghost" id="next">Next: campaign</button>' : ''}
        </div>
      </div>
      ${!health.key ? '<div class="note err">No Groq key loaded. Add GROQ_API_KEY to app/.env and restart the server.</div>' : ''}
      ${!ready ? `<div class="empty"><h3>Setup first</h3>
        Aarav needs a brand name and description before he can build anything.
        <div class="row" style="justify-content:center;margin-top:14px">
          <a class="btn btn-primary btn-sm" href="#/setup">Go to setup</a></div></div>`
      : `<div id="stagesHost">${stageCards(AGENTS)}</div>`}`;

    // A completed run rehydrates from the store, so leaving and returning
    // doesn't cost another set of Groq calls.
    if (ws.strategy) {
      for (const a of AGENTS) {
        const st = $(`#stage-${a.id}`, view);
        if (!st || !ws.strategy[a.id]) continue;
        st.dataset.state = 'done';
        $(`#meta-${a.id}`, view).textContent = 'saved';
        $(`#body-${a.id}`, view).innerHTML = `<div class="result">${renderAgent(a.id, ws.strategy[a.id])}</div>`;
      }
    }

    view.addEventListener('click', async (e) => {
      if (e.target.closest('#next')) return go('campaign');
      const btn = e.target.closest('#run');
      if (!btn) return;

      btn.disabled = true;
      btn.textContent = 'Team is working';
      $('#stagesHost', view).innerHTML = stageCards(AGENTS);
      try {
        await streamInto('/api/run/strategy', {}, {
          onDone: async () => { await refresh(); toast('Brand Brain saved'); },
          onFail: (m) => toast(m)
        });
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Run again <span class="arr">→</span>';
      }
    });
  }
};
