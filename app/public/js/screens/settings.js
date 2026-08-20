// Dashboard · Settings — model choice, timezone, and the reset that gets a
// rehearsal back to zero.

import { $, esc, toast } from '../ui.js';
import { ws, health, save, refresh } from '../state.js';
import { api } from '../api.js';
import { go } from '../app.js';

export default {
  async render(view) {
    const { models } = await api.models().catch(() => ({ models: [] }));
    const active = ws.settings.model || health.model;

    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Dashboard · Settings</p>
          <h1>Settings</h1>
          <p class="lede">Which model the team runs on, and how the workspace behaves.</p>
        </div>
      </div>

      <div class="grid g2">
        <div class="card">
          <p class="card-title">Model</p>
          <label class="field"><span>Groq model <span class="hint">live list</span></span>
            <select id="model">${models.map((m) =>
              `<option${m === active ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
          <p class="note info">Read from your account at startup, so a retired model can't take
            a demo down. Free tier allows about 8,000 tokens per minute — a full campaign plan
            fits, but two runs inside the same minute will wait.</p>
        </div>

        <div class="card">
          <p class="card-title">Workspace</p>
          <label class="field"><span>Timezone</span>
            <input id="tz" value="${esc(ws.settings.timezone)}"></label>
          <div class="row" style="margin-top:6px">
            <div class="kv" style="flex:1"><div class="k">Groq key</div>
              <div class="v">${health.key ? 'loaded from app/.env' : 'missing'}</div></div>
            <div class="kv" style="flex:1"><div class="k">Posts stored</div>
              <div class="v">${(ws.posts || []).length}</div></div>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn btn-ghost btn-sm" id="save">Save settings</button>
            <button class="btn btn-danger btn-sm" id="reset">Reset workspace</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <p class="card-title">The team</p>
        <table><thead><tr><th>#</th><th>Agent</th><th>Role</th><th>Runs at</th><th>Does</th></tr></thead>
        <tbody>${health.agents.map((a, i) => `<tr>
          <td class="mono" style="color:var(--ink-4)">${String(i + 1).padStart(2, '0')}</td>
          <td><b style="color:var(--ink)">${esc(a.name)}</b></td>
          <td>${esc(a.role)}</td>
          <td class="mono" style="font-size:.6875rem">${esc(a.step)}</td>
          <td style="color:var(--ink-3)">${esc(a.blurb)}</td></tr>`).join('')}</tbody></table>
      </div>`;

    $('#save', view).addEventListener('click', async () => {
      await save('settings', { model: $('#model', view).value, timezone: $('#tz', view).value.trim() });
      toast('Settings saved');
    });

    $('#reset', view).addEventListener('click', async () => {
      if (!confirm('Clear the brand, campaign, calendar and all generated posts?')) return;
      await api.reset();
      await refresh();
      toast('Workspace reset');
      go('setup');
    });
  }
};
