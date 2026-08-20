# raindeer.social — MVP

The eight-step content engine from the reference flow, driven by the five agents
in the pitch deck, in the raindeer.social design language.

```bash
cd app
node server.js        # → http://localhost:4200
```

Zero dependencies, Node 18+. The Groq key is read from `app/.env`.

## Studio — the canvas

`http://localhost:4200/#/studio` is the demo screen. An infinite n8n-style
canvas: pick a platform, say what the post should do, and watch context travel
along the wire — Aarav → Ved → Keshav → Kavi → Neer — each node streaming its
own thinking, then collapsing into a summary. The last node renders the finished
post **as that platform renders it**: pick X and you get an X card, pick
Instagram and you get the square feed post.

Pan by dragging, zoom toward the cursor with the wheel, minimap bottom-right,
fit/reset bottom-left. Click any finished node to open its full output.

One run is five sequential Groq calls, about 5–13 seconds.

## The eight-step flow



| # | Step | What happens | Agent |
|---|------|--------------|-------|
| 1 | **Setup** | Brand basics, business details, tone, mood, platforms | — |
| 2 | **Strategy** | Brand Brain + market read | **Aarav** (On Board), **Ved** (Research) |
| 3 | **Campaign** | Goal, duration, volume, core message | — |
| 4 | **Planning** | One big idea, split into dated slots on the calendar | **Keshav** (Creative) |
| 5 | **Calendar** | Month/week view, click any slot to book or open one | **Kavi** (Generation) |
| 6 | **Review** | Scorecard, flags, one human approve | **Neer** (Reviewer) |
| 7 | **Output** | Approved posts, platform-shaped, copy out | — |
| 8 | **Analytics** | Agent telemetry (measured) + engagement (projected) | — |

Plus **Settings** — model picker from your live Groq list, timezone, reset.

A full pass — setup through three reviewed posts — takes about 40 seconds of
agent time.

## How it fits together

```
public/js/studio/canvas.js   the infinite canvas: pan/zoom, bezier edges, flowing particles
public/js/studio/previews.js platform-accurate post previews (X, LinkedIn, IG, Threads, FB)
public/js/screens/*.js   one module per screen, each exporting { render }
public/js/pipeline.js    the agent stream UI: live tokens, then a rendered result
public/js/state.js       workspace mirror; screens read `ws`, write through `save`
server.js                static host + workspace API + the four agent runs
agents.js                all five agents: prompts, JSON schemas, token budgets
groq.js                  Groq client — model resolution, JSON mode, 429 backoff
store.js                 workspace.json persistence
```

State lives in `app/workspace.json`, so a restart keeps your demo. Settings →
Reset workspace clears it.

## Things worth knowing

**Rate limit.** Free tier is ~8,000 tokens/minute. Strategy is ~1,600 and each
post is ~800, so a normal pass fits. Hammer it and a stage will show
`rate limit · Ns` and resume by itself rather than failing.

**The model is chosen for you.** Groq retires models without notice, so the
server reads your account's live list at startup and picks the best available.
Override it in Settings.

**Analytics is two different things.** Agent calls, latency and tokens are
measured. Reach and engagement are *projected* from platform averages and Neer's
brand-fit score — no social account is connected, and the screen says so. Wire a
real account and those become live numbers.

**Truth guardrails.** The agents are instructed not to invent statistics,
testimonials, offers, links or credentials, not to contradict how the product
actually works, and Neer is told to strip what slips through. Neer also fills a
`claims_checked` ledger — every number, price, offer and link in the post, each
marked supported or not against what the brand actually gave us — and anything
unsupported caps accuracy at 50 and blocks approval. This catches the big
failures. It is not a substitute for reading the post — which is exactly what
the human approval step is for.
