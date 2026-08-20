// The five agents from the raindeer.social deck: Onboard · Research · Creative
// · Generation · Reviewer. Each one is a single Groq call with a strict JSON
// contract, and each reads the output of everyone before it.

// Every downstream agent used to receive the full JSON of everyone before it.
// On Groq's free tier that is the whole game: 8,000 tokens per minute is the
// hard ceiling, so each agent gets only the fields it actually reads.
const j = (o) => JSON.stringify(o);

const brandCard = (o = {}) => j({
  positioning: o.positioning,
  voice: o.voice,
  audience: o.audience,
  pillars: o.pillars
});

// Only "brief"-sourced claims are publishable; the rest are assumptions.
const canClaim = (o = {}) => j({
  voice: o.voice,
  can_claim: (o.proof_points || []).map((p) => (typeof p === 'string' ? p : p.source === 'brief' && p.claim)).filter(Boolean),
  never_do: o.never_do
});

const researchCard = (r = {}) => j({
  trends: (r.trends || []).map((t) => t.signal),
  audience_questions: r.audience_questions,
  format_recommendation: r.format_recommendation
});

const briefCard = (c = {}) => j({
  big_idea: c.big_idea, angle: c.angle, hooks: c.hooks,
  format: c.format, cta: c.cta, tone_notes: c.tone_notes
});

export const AGENTS = [
  {
    id: 'onboard',
    name: 'Aarav',
    role: 'On Board',
    blurb: 'Learns brand identity, goals, audience, voice, history, and positioning',
    temperature: 0.3,
    maxTokens: () => 900,
    schema: `{
  "positioning": "one sentence — what this brand is, for whom, and why it wins",
  "voice": ["4 short voice descriptors, e.g. 'plain-spoken, no jargon'"],
  "audience": [{"segment": "who they are", "pain": "the thing that keeps them up at night"}],
  "pillars": ["4 content pillars this brand should own"],
  "proof_points": [{"claim": "something the brand can say about itself", "source": "brief|inferred"}],
  "never_do": ["3 things that would feel off-brand"]
}`,
    prompt: (b) => `Build the Brand Brain for this business. Be specific to THIS brand — no
generic marketing filler, no "leverage synergies". If a detail is missing, infer the most
likely truth for a business of this shape and stay concrete.

CRITICAL on proof_points. Mark each one honestly:
- "brief" — only if it is stated in, or directly follows from, the text below.
- "inferred" — anything you assumed, and anything containing a number you were not given.
Never present an invented customer count, rating, percentage, funding figure or award as
"brief". Downstream agents are only allowed to publish "brief" claims, so mislabelling one
puts a false statistic into a real post.

BRAND: ${b.brand}
WEBSITE: ${b.website || '(not provided)'}
WHAT THEY DO: ${b.what}
AUDIENCE THEY SELL TO: ${b.audience || '(infer it)'}
TONE THEY WANT: ${b.tone}`
  },

  {
    id: 'research',
    name: 'Ved',
    role: 'Research',
    blurb: 'Researches markets, competitors, trends, audiences, and platform behavior',
    temperature: 0.4,
    maxTokens: () => 1100,
    schema: `{
  "trends": [{"signal": "a specific, current conversation or shift", "why_now": "why it matters to this brand this week", "confidence": "high|medium|low"}],
  "competitor_angles": ["3 angles competitors are already running — so we avoid or invert them"],
  "audience_questions": ["3 real questions this audience is actually asking"],
  "best_time": {"window": "e.g. Tue 9:30–11:00 AM IST", "rationale": "platform-behavior reason"},
  "format_recommendation": "the single format most likely to land, and why"
}`,
    prompt: (b, prior) => `Run the research pass for the topic below. Ground everything in the
Brand Brain. Give 3 trends. Mark confidence honestly — this is a modelled read, not a live
web crawl, so say "medium"/"low" where you're extrapolating.

TOPIC / GOAL: ${b.topic}
TARGET PLATFORMS: ${b.platforms.join(', ')}

BRAND BRAIN:
${brandCard(prior.onboard)}`
  },

  {
    id: 'creative',
    name: 'Keshav',
    role: 'Creative',
    blurb: 'Defines creative direction, formats, hooks, visuals, and platform strategy',
    temperature: 0.8,
    maxTokens: () => 900,
    schema: `{
  "big_idea": "the one idea this post is actually about, in a sentence",
  "angle": "the specific take — what makes a scroller stop",
  "hooks": ["3 competing first lines, each under 90 characters"],
  "format": "the chosen format, e.g. 'single image + 120-word story post'",
  "visual_direction": "art direction a designer could execute from",
  "cta": "the one action we want",
  "tone_notes": "how it should feel to read"
}`,
    prompt: (b, prior) => `Write the creative brief. Pick ONE big idea and commit to it —
a brief that hedges produces a post that hedges. Hooks must be openers a real person
would say out loud, not headlines.

TOPIC / GOAL: ${b.topic}
PLATFORMS: ${b.platforms.join(', ')}

BRAND BRAIN:
${brandCard(prior.onboard)}

RESEARCH:
${researchCard(prior.research)}`
  },

  {
    id: 'generation',
    name: 'Kavi',
    role: 'Generation',
    blurb: 'Generates personalized, platform-ready content using brand and research context',
    temperature: 0.75,
    maxTokens: (b) => 700 + 500 * b.platforms.length,
    schema: `{
  "posts": [{"platform": "exact platform name", "body": "the full post, ready to publish, real line breaks", "hashtags": ["3-5, lowercase, no spam"]}],
  "image_prompt": "a prompt for an image model that matches the visual direction",
  "alt_text": "accessible alt text for that image"
}`,
    prompt: (b, prior) => `Write the actual posts — one per platform, each written natively for
that platform, not one post copy-pasted three times.

Platform rules:
- LinkedIn: 120–200 words, short paragraphs, a real opinion, no emoji walls, no "I'm humbled to announce".
- X: under 240 characters INCLUDING the hashtags. One idea. No thread.
- Instagram: 80–150 words, warmer, line breaks with rhythm, hashtags at the end.
- Threads / Facebook: conversational, 60–120 words.

Use the chosen hook from the brief, or a sharper variant of it.

Three hard rules — a post that breaks one is unusable:
1. Write as the brand's own account. Never invent a personal anecdote, a named customer,
   or a first-person testimonial ("At 28 I found out I was pre-diabetic…"). If you want a
   human angle, frame it as what the brand sees across its users, not as one person's story.
2. Only use a proof point whose source is "brief". Never state a number, percentage,
   customer count, rating, award or credential that is not in those. If a claim would need
   a statistic you weren't given, make the point qualitatively instead.
   This covers offers too: no free trial, discount, price, guarantee, launch date or
   deadline unless it appears in the brief. Inventing "start your free 7-day trial" commits
   the business to something it may not sell.
3. Hashtags: lowercase letters and digits only. No hyphens, no punctuation, no spaces.

Use plain ASCII punctuation — ordinary hyphens, quotes and spaces — so the text pastes
cleanly into the platform composers.

PLATFORMS TO WRITE FOR: ${b.platforms.join(', ')}

WHAT THE BRAND MAY CLAIM:
${canClaim(prior.onboard)}

CREATIVE BRIEF:
${briefCard(prior.creative)}`
  },

  {
    id: 'reviewer',
    name: 'Neer',
    role: 'Reviewer',
    blurb: 'Reviews quality, accuracy, brand fit, relevance, safety, and personalization',
    temperature: 0.2,
    maxTokens: (b) => 900 + 600 * b.platforms.length,
    schema: `{
  "scores": {"brand_fit": 0, "accuracy": 0, "platform_fit": 0, "safety": 0, "personalization": 0},
  "verdict": "approve|edit_requested|reject",
  "issues": [{"severity": "high|medium|low", "note": "what is wrong and why it matters"}],
  "final_posts": [{"platform": "exact platform name", "body": "the corrected, publish-ready post", "hashtags": ["..."]}],
  "summary": "one sentence a founder can read before hitting approve"
}`,
    prompt: (b, prior) => `Review the drafts against the Brand Brain. Score each dimension 0–100
and be a hard marker — a 95 should mean something, and accuracy above 90 means you checked every
claim, not that the post reads well.

Reject-level problems, each a "high" severity issue — and fix every one of them in final_posts,
do not merely note it:
- Any number, percentage, customer count, rating, award or credential that is not a proof point
  with source "brief". Cut it or rewrite the sentence without it.
- Any offer the brand never mentioned — a free trial, discount, price, guarantee, deadline or
  launch date. Replace the call to action with one the brand can actually honour.
- A fabricated personal story, invented customer, or fake first-person testimonial.
- A medical, financial or legal claim the brand isn't licensed to make.
- Hashtags containing hyphens, punctuation or spaces, and any platform over its limit
  (X: 240 characters including hashtags).

Then return final_posts: the drafts with your fixes actually applied, for every platform,
publish-ready as-is, in plain ASCII punctuation.

WHAT THE BRAND MAY CLAIM:
${canClaim(prior.onboard)}

DRAFTS:
${j(prior.generation)}`
  }
];

const SYSTEM = (a) => `You are ${a.name}, the ${a.role} agent on raindeer.social — an AI marketing
team that runs research, creative, generation, and review for lean businesses.

Return ONLY a single JSON object, no prose before or after, no markdown code fences.
It must match this shape exactly:

${a.schema}

Write like a sharp human strategist: concrete nouns, short sentences, zero corporate filler.`;

export function buildMessages(agent, brief, prior) {
  return [
    { role: 'system', content: SYSTEM(agent) },
    { role: 'user', content: agent.prompt(brief, prior) }
  ];
}

// Models tolerate a stray fence or a leading sentence; the UI shouldn't.
export function parseJSON(raw) {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  const body = t.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    // Trailing commas are the one failure mode worth repairing locally.
    return JSON.parse(body.replace(/,(\s*[}\]])/g, '$1'));
  }
}
