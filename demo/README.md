# raindeer.social — live pitch demo

The five-agent marketing team from the deck (Aarav · Ved · Keshav · Kavi · Neer),
running for real on Groq, in the raindeer.social design language.

Type a brand and a topic, hit **Deploy the team**, and five sequential Groq calls
run the full pipeline on screen: Brand Brain → research → creative brief →
platform-native drafts → reviewer scorecard → publish-ready posts with a run
receipt (wall clock, tokens, agents, one human decision).

## Run it

```bash
cd demo
cp .env.example .env
# paste your key from https://console.groq.com/keys
node server.js          # → http://localhost:4173
```

No `npm install` — zero dependencies, Node 18+ only (uses built-in `fetch`).

## Files

| File | What it is |
|---|---|
| `server.js` | Static server + `POST /api/run`, which streams the pipeline to the browser over SSE |
| `agents.js` | The five agents: system prompt, JSON schema, and per-agent prompt. Edit prompts here. |
| `public/index.html` · `styles.css` · `app.js` | The UI — design tokens lifted from the live raindeer.social site |

## Config

| Env var | Default |
|---|---|
| `GROQ_API_KEY` | — (required) |
| `GROQ_MODEL` | auto — picks the best model your account actually has |
| `PORT` | `4173` |

Don't pin `GROQ_MODEL` unless you have a reason. Groq retires models without
notice, and the server checks the live model list at startup and falls back to
the best available one rather than 404-ing mid-demo. The dropdown in the UI is
populated from the same list, so you can switch models between runs.

## What a run costs, and the one limit to know

A three-platform run is about **5,400 tokens in ~7 seconds**. The free tier caps
you at **8,000 tokens per minute**, so a single run fits comfortably but two
back-to-back runs inside the same minute will not.

If that happens the run doesn't break — Groq says how long to wait, the server
waits it out, and the agent card shows `rate limit · resuming in Ns`. It just
costs you 5–20 seconds of dead air. Before going on stage, either leave ~30
seconds between runs, or upgrade to Groq's Dev tier, which lifts the ceiling.

Three implementation details do the heavy lifting here, and are worth keeping if
you refactor:

- **`reasoning_effort: 'low'`** — without it the model spends ~350 tokens
  thinking before writing, which both doubles latency and truncates answers.
- **`response_format: json_object`** — guarantees parseable output, so the
  fallback repair path effectively never runs.
- **Compact hand-offs** — each agent gets only the fields it reads, not the full
  JSON of everyone before it. This alone cut a run from ~17k tokens to ~5.4k.

## Demo script (90 seconds on stage)

1. Click the **Slay Health** preset — a real pilot partner from the deck.
2. Hit **Deploy the team**. Talk over the stream: each agent is reading the one
   before it, nobody re-types the brand context.
3. Land on the output: platform-native posts, a reviewer scorecard, and the
   receipt — five agents, ~7 seconds, one human decision instead of a week of
   back-and-forth with an agency.

## Honest limits

Research is the model's own knowledge, not a live web crawl — Ved marks
confidence accordingly. In the product this is the `SearchProvider` interface
(Tavily today) from the blueprint. Nothing is persisted; every run is fresh.

The agents are told not to publish any statistic, credential or offer that isn't
in the brief, and Neer is told to strip the ones that slip through. That holds
for the big things — invented customer counts, fake testimonials, made-up free
trials — but a small descriptive flourish can still get past it ("a 5-minute
test"). Read the final post before you publish it. That's what the human
approval step in the deck is for, and it's the honest answer if an investor asks.
