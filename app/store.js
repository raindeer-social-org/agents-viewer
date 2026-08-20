// One workspace, persisted to a JSON file so a server restart doesn't wipe a
// demo mid-rehearsal. A real deployment swaps this for the Postgres schema in
// the blueprint; nothing above it needs to change.

import fs from 'node:fs';

const EMPTY = {
  brand: {
    name: '', website: '', industry: '', what: '', audience: '',
    accountType: 'Business', tone: 'Professional / Calm', mood: 'Bright / Bold',
    platforms: ['LinkedIn'], theme: 'cobalt'
  },
  campaign: {
    goal: 'Awareness', duration: 14, pieces: 6,
    mode: 'Full Content Engine', message: '', startDate: null
  },
  strategy: null,   // { onboard, research }
  planning: null,   // { big_idea, angle, visual_direction, cta, plan[] }
  posts: [],        // calendar items
  runs: [],         // agent run receipts — cost/latency backbone from the blueprint
  settings: { model: null, autoSchedule: true, timezone: 'Asia/Kolkata' }
};

export class Store {
  constructor(file) {
    this.file = file;
    this.data = this.#read();
  }

  #read() {
    try {
      if (fs.existsSync(this.file)) {
        return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
      }
    } catch (err) {
      console.warn(`  could not read ${this.file} (${err.message}); starting fresh`);
    }
    return structuredClone(EMPTY);
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.warn(`  could not persist workspace: ${err.message}`);
    }
    return this.data;
  }

  patch(section, values) {
    this.data[section] = { ...this.data[section], ...values };
    return this.save();
  }

  set(section, value) {
    this.data[section] = value;
    return this.save();
  }

  reset() {
    this.data = structuredClone(EMPTY);
    return this.save();
  }

  addRun(run) {
    this.data.runs.unshift(run);
    this.data.runs = this.data.runs.slice(0, 100);
    return this.save();
  }

  // ── calendar posts ──────────────────────────────────────────────
  upsertPost(post) {
    const i = this.data.posts.findIndex((p) => p.id === post.id);
    if (i === -1) this.data.posts.push(post);
    else this.data.posts[i] = { ...this.data.posts[i], ...post };
    this.save();
    return this.data.posts.find((p) => p.id === post.id);
  }

  getPost(id) {
    return this.data.posts.find((p) => p.id === id);
  }

  deletePost(id) {
    this.data.posts = this.data.posts.filter((p) => p.id !== id);
    return this.save();
  }
}

export const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
