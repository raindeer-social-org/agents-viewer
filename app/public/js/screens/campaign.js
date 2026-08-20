// Step 3 — the campaign frame Keshav plans against: goal, duration, volume,
// mode and the core message.

import { $, esc, chipGroup, wireChips, toast, toLocalInput } from '../ui.js';
import { ws, save } from '../state.js';
import { go } from '../app.js';

const GOALS = ['Awareness', 'Engagement', 'Conversion', 'Launch', 'Promoting'];
const MODES = ['Single Content Piece', 'Full Content Engine'];

export default {
  async render(view) {
    const c = ws.campaign;
    const start = c.startDate || new Date().toISOString();
    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 03 · Campaign</p>
          <h1>Frame the campaign</h1>
          <p class="lede">One goal, one message, a duration and a volume. Keshav turns this into
            a dated plan on the next screen.</p>
        </div>
        <div class="row"><button class="btn btn-primary" id="next">Save and plan it <span class="arr">→</span></button></div>
      </div>

      <div class="grid g2">
        <div class="card">
          <p class="card-title">Objective</p>
          <label class="field"><span>Campaign goal</span>${chipGroup('goal', GOALS, c.goal)}</label>
          <label class="field"><span>Mode</span>${chipGroup('mode', MODES, c.mode)}</label>
          <label class="field" style="margin-bottom:0"><span>Core message</span>
            <textarea name="message" rows="4" placeholder="The one thing this campaign should make people believe.">${esc(c.message)}</textarea></label>
        </div>

        <div class="card">
          <p class="card-title">Shape</p>
          <label class="field"><span>Duration <span class="hint">days</span></span>
            <input type="number" name="duration" min="1" max="90" value="${esc(c.duration)}"></label>
          <label class="field"><span>Content pieces</span>
            <input type="number" name="pieces" min="1" max="12" value="${esc(c.pieces)}"></label>
          <label class="field" style="margin-bottom:0"><span>Starts</span>
            <input type="datetime-local" name="startDate" value="${esc(toLocalInput(start))}"></label>
          <p class="note info" style="margin-top:14px">Twelve pieces is the ceiling — each one is
            its own Groq call, and the free tier allows about eight thousand tokens a minute.</p>
        </div>
      </div>`;

    wireChips(view, (name, value) => save('campaign', { [name]: value }));

    const read = () => ({
      goal: ws.campaign.goal,
      mode: ws.campaign.mode,
      message: $('[name=message]', view).value.trim(),
      duration: Math.max(1, Math.min(90, Number($('[name=duration]', view).value) || 14)),
      pieces: Math.max(1, Math.min(12, Number($('[name=pieces]', view).value) || 6)),
      startDate: new Date($('[name=startDate]', view).value || Date.now()).toISOString()
    });

    $('#next', view).addEventListener('click', async () => {
      const next = read();
      if (!next.message) return toast('Keshav needs a core message to plan against.');
      await save('campaign', next);
      go('planning');
    });
  }
};
