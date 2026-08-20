// Step 1 — Brand Basics, Business Details, Tone & Style, Mood, Platforms.
// Everything Aarav reads on the next screen.

import { $, esc, chipGroup, wireChips, toast } from '../ui.js';
import { ws, save } from '../state.js';
import { go } from '../app.js';

const TONES = ['Professional / Calm', 'Bold / Disruptive', 'Upbeat / Energetic', 'Tech / Clean'];
const MOODS = ['Bright / Bold', 'Dark / Premium'];
const ACCOUNTS = ['Individual', 'Business', 'Agency'];
const PLATFORMS = ['LinkedIn', 'X', 'Instagram', 'Threads', 'Facebook'];

const PRESETS = {
  'Slay Health': {
    name: 'Slay Health', website: 'slay.health', industry: 'Preventive healthcare',
    what: 'Preventive health testing for Indian professionals — full-body blood panels booked from a phone, sample collected at home, results read by a doctor within 24 hours.',
    audience: 'Working professionals, 25-40, metro India',
    accountType: 'Business', tone: 'Professional / Calm', mood: 'Bright / Bold',
    platforms: ['LinkedIn', 'Instagram']
  },
  Hoblix: {
    name: 'Hoblix', website: 'hoblix.com', industry: 'Community / social',
    what: 'A community platform that turns hobbies into local meetups — discover people near you who do the thing you do, and actually show up.',
    audience: 'Urban 22-35 year olds who moved cities for work and lost their circle',
    accountType: 'Business', tone: 'Upbeat / Energetic', mood: 'Bright / Bold',
    platforms: ['Instagram', 'X']
  },
  'raindeer.social': {
    name: 'raindeer.social', website: 'raindeer.social', industry: 'AI / marketing software',
    what: 'An AI-powered social engine: a team of agents that researches trends, generates on-brand posts, and automates the publishing schedule for lean startups and agencies.',
    audience: 'Founders of SMBs and small agencies in India who cannot afford a 25K-1L per month retainer',
    accountType: 'Agency', tone: 'Bold / Disruptive', mood: 'Dark / Premium',
    platforms: ['LinkedIn', 'X']
  }
};

export default {
  async render(view) {
    const b = ws.brand;
    view.innerHTML = `
      <div class="head-row">
        <div>
          <p class="eyebrow"><span class="rule"></span>Step 01 · On Board</p>
          <h1>Set up the brand</h1>
          <p class="lede">This is the only time you describe the business. Every agent after
            this reads from here instead of asking you again.</p>
        </div>
        <div class="row">${Object.keys(PRESETS).map((k) =>
          `<button class="btn btn-ghost btn-sm" data-preset="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      </div>

      <div class="grid g2">
        <div class="card">
          <p class="card-title">Brand basics</p>
          <label class="field"><span>Brand name</span>
            <input name="name" value="${esc(b.name)}" placeholder="Slay Health"></label>
          <label class="field"><span>Website <span class="hint">optional</span></span>
            <input name="website" value="${esc(b.website)}" placeholder="slay.health"></label>
          <label class="field"><span>Industry <span class="hint">optional</span></span>
            <input name="industry" value="${esc(b.industry)}" placeholder="Preventive healthcare"></label>
          <label class="field" style="margin-bottom:0"><span>Account type</span>
            ${chipGroup('accountType', ACCOUNTS, b.accountType)}</label>
        </div>

        <div class="card">
          <p class="card-title">Business details</p>
          <label class="field"><span>What the business does</span>
            <textarea name="what" rows="4" placeholder="Describe it the way you would to a new hire.">${esc(b.what)}</textarea></label>
          <label class="field" style="margin-bottom:0"><span>Target audience <span class="hint">optional</span></span>
            <textarea name="audience" rows="2" placeholder="Working professionals, 25-40, metro India">${esc(b.audience)}</textarea></label>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <p class="card-title">Tone &amp; style</p>
        <div class="grid g3">
          <label class="field" style="margin:0"><span>Voice</span>${chipGroup('tone', TONES, b.tone)}</label>
          <label class="field" style="margin:0"><span>Mood</span>${chipGroup('mood', MOODS, b.mood)}</label>
          <label class="field" style="margin:0"><span>Platforms <span class="hint">multi</span></span>
            ${chipGroup('platforms', PLATFORMS, b.platforms, true)}</label>
        </div>
      </div>

      <div class="row row-end" style="margin-top:18px">
        <button class="btn btn-ghost" id="saveOnly">Save</button>
        <button class="btn btn-primary" id="next">Save and brief the team <span class="arr">→</span></button>
      </div>`;

    const read = () => ({
      ...ws.brand,
      name: $('[name=name]', view).value.trim(),
      website: $('[name=website]', view).value.trim(),
      industry: $('[name=industry]', view).value.trim(),
      what: $('[name=what]', view).value.trim(),
      audience: $('[name=audience]', view).value.trim()
    });

    // Chip changes persist immediately; text fields save on the buttons.
    wireChips(view, (name, value) => save('brand', { ...read(), [name]: value }));

    view.addEventListener('click', async (e) => {
      const preset = e.target.closest('[data-preset]')?.dataset.preset;
      if (preset) {
        await save('brand', { ...ws.brand, ...PRESETS[preset] });
        toast(`Loaded ${preset}`);
        return go('setup');
      }
      if (e.target.closest('#saveOnly')) {
        await save('brand', read());
        return toast('Saved');
      }
      if (e.target.closest('#next')) {
        const brand = read();
        if (!brand.name || !brand.what) return toast('Aarav needs a brand name and a description.');
        await save('brand', brand);
        go('strategy');
      }
    });
  }
};
