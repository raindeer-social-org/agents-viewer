// The five agents from the raindeer.social deck. Same five names, but wired to
// the eight-step flow: Aarav and Ved build strategy, Keshav plans the campaign
// calendar, Kavi writes each booked slot, Neer reviews before publish.

const j = (o) => JSON.stringify(o);

const brandCard = (o = {}) => j({
  positioning: o.positioning, voice: o.voice, audience: o.audience, pillars: o.pillars
});

// Only "brief"-sourced claims are publishable; everything else is an assumption.
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

// Rules learned the hard way: the model will invent statistics, testimonials
// and free trials unless each is named and forbidden explicitly.
const TRUTH_RULES = `
Hard rules — a post that breaks one is unusable:
1. Write as the brand's own account. Never invent a personal anecdote, a named customer,
   or a first-person testimonial. A human angle is what the brand sees across its users.
   Concretely: no sentence may narrate the writer's own experience ("I cut my budget and my
   revenue dipped"). If the brief hands you a hook that does this, rewrite it in the brand's
   voice before using it. Never invent a URL, link or domain — if the brief gave you none,
   end on an action instead of a link.
2. Only use a claim listed in can_claim. Never state a number, percentage, customer count,
   rating, award or credential that is not there. This covers offers too: no free trial,
   discount, price, guarantee, launch date or deadline unless the brand gave you one.
   And never contradict a can_claim item — if it says samples are collected at home, the post
   cannot send anyone to a lab. Describing how the product works incorrectly is worse than
   saying nothing about it.
3. Hashtags: lowercase letters and digits only. No hyphens, punctuation or spaces.
4. Plain ASCII punctuation, so the text pastes cleanly into the platform composer.`;

export const AGENTS = {
  onboard: {
    id: 'onboard',
    name: 'Aarav',
    role: 'On Board',
    blurb: 'Learns brand identity, goals, audience, voice, history, and positioning',
    step: 'strategy',
    temperature: 0.3,
    maxTokens: () => 900,
    schema: `{
  "positioning": "one sentence — what this brand is, for whom, and why it wins",
  "voice": ["4 short voice descriptors"],
  "audience": [{"segment": "who they are", "pain": "what keeps them up at night"}],
  "pillars": ["4 content pillars this brand should own"],
  "proof_points": [{"claim": "something the brand can say about itself", "source": "brief|inferred"}],
  "never_do": ["3 things that would feel off-brand"]
}`,
    prompt: (s) => `Build the Brand Brain for this business. Be specific to THIS brand — no
generic marketing filler. If a detail is missing, infer the most likely truth for a business
of this shape and stay concrete.

CRITICAL on proof_points. Mark each honestly:
- "brief" — only if stated in, or directly following from, the text below.
- "inferred" — anything you assumed, and anything with a number you were not given.
Downstream agents may only publish "brief" claims, so mislabelling one puts a false
statistic into a real post.

BRAND: ${s.brand.name}
WEBSITE: ${s.brand.website || '(not provided)'}
INDUSTRY: ${s.brand.industry || '(infer it)'}
WHAT THEY DO: ${s.brand.what}
AUDIENCE: ${s.brand.audience || '(infer it)'}
ACCOUNT TYPE: ${s.brand.accountType}
TONE & STYLE: ${s.brand.tone}
MOOD: ${s.brand.mood}`
  },

  research: {
    id: 'research',
    name: 'Ved',
    role: 'Research',
    blurb: 'Researches markets, competitors, trends, audiences, and platform behavior',
    step: 'strategy',
    temperature: 0.4,
    maxTokens: () => 1100,
    schema: `{
  "trends": [{"signal": "a specific current shift", "why_now": "why it matters to this brand now", "confidence": "high|medium|low"}],
  "competitor_angles": ["3 angles competitors already run — to avoid or invert"],
  "audience_questions": ["3 real questions this audience is asking"],
  "best_time": {"window": "e.g. Tue 9:30-11:00 AM IST", "rationale": "platform-behavior reason"},
  "format_recommendation": "the single format most likely to land, and why"
}`,
    prompt: (s, prior) => `Run the research pass for this brand. Give 3 trends. Mark confidence
honestly — this is a modelled read, not a live web crawl, so say "medium"/"low" where you are
extrapolating.

TARGET PLATFORMS: ${s.brand.platforms.join(', ')}

BRAND BRAIN:
${brandCard(prior.onboard)}`
  },

  creative: {
    id: 'creative',
    name: 'Keshav',
    role: 'Creative',
    blurb: 'Defines creative direction, formats, hooks, visuals, and platform strategy',
    step: 'planning',
    temperature: 0.8,
    maxTokens: (s) => 700 + 260 * Math.min(s.campaign.pieces, 12),
    schema: `{
  "big_idea": "the one idea this campaign is about, in a sentence",
  "angle": "the specific take — what makes a scroller stop",
  "visual_direction": "art direction a designer could execute from",
  "cta": "the one action we want",
  "plan": [{
    "title": "short working title for this piece",
    "hook": "the opening line, under 90 characters",
    "platform": "one of the target platforms",
    "format": "e.g. single image, carousel, text post, reel",
    "day": 1,
    "time": "09:30"
  }]
}`,
    prompt: (s) => `Plan a ${s.campaign.duration}-day campaign as ${s.campaign.pieces} content
pieces. Pick ONE big idea and commit to it, then vary the angle across pieces so the campaign
builds instead of repeating itself.

For each piece set "day" as an offset from day 1 of the campaign, spread sensibly across the
${s.campaign.duration} days, and "time" as a 24-hour HH:MM slot that suits the platform and
this audience. Return exactly ${s.campaign.pieces} pieces in "plan".

CAMPAIGN GOAL: ${s.campaign.goal}
CORE MESSAGE: ${s.campaign.message}
MODE: ${s.campaign.mode}
PLATFORMS: ${s.brand.platforms.join(', ')}

BRAND BRAIN:
${brandCard(s.strategy.onboard)}

RESEARCH:
${researchCard(s.strategy.research)}`
  },

  generation: {
    id: 'generation',
    name: 'Kavi',
    role: 'Generation',
    blurb: 'Generates personalized, platform-ready content using brand and research context',
    step: 'calendar',
    temperature: 0.75,
    maxTokens: () => 1000,
    schema: `{
  "body": "the full post, ready to publish, with real line breaks",
  "hashtags": ["3-5 hashtags"],
  "image_prompt": "a prompt for an image model matching the visual direction",
  "alt_text": "accessible alt text"
}`,
    prompt: (s, prior, piece) => `Write ONE post for the slot below, native to its platform.

Platform rules:
- LinkedIn: 120-200 words, short paragraphs, a real opinion, no emoji walls.
- X: under 240 characters INCLUDING hashtags. One idea, no thread.
- Instagram: 80-150 words, warmer, line breaks with rhythm, hashtags at the end.
- Threads / Facebook: conversational, 60-120 words.
${TRUTH_RULES}

THIS SLOT:
${j(piece)}

CAMPAIGN: ${s.campaign.goal} — ${s.campaign.message}
BIG IDEA: ${s.planning.big_idea}
CTA: ${s.planning.cta}

WHAT THE BRAND MAY CLAIM:
${canClaim(s.strategy.onboard)}`
  },

  reviewer: {
    id: 'reviewer',
    name: 'Neer',
    role: 'Reviewer',
    blurb: 'Reviews quality, accuracy, brand fit, relevance, safety, and personalization',
    step: 'review',
    temperature: 0.2,
    maxTokens: () => 1700,
    schema: `{
  "claims_checked": [{"claim": "every number, statistic, price, offer, link or credential in the post", "supported": true}],
  "scores": {"brand_fit": 0, "accuracy": 0, "platform_fit": 0, "safety": 0, "personalization": 0},
  "verdict": "approve|edit_requested|reject",
  "issues": [{"severity": "high|medium|low", "note": "what is wrong and why it matters"}],
  "final_body": "the corrected, publish-ready post",
  "final_hashtags": ["..."],
  "summary": "one sentence a founder can read before hitting approve"
}`,
    prompt: (s, prior, piece) => `Review this draft.

FIRST fill in claims_checked: pull out every number, percentage, price, discount, offer,
deadline, link, award and credential in the post, and mark supported:true only if can_claim
backs it. An empty list means the post makes no such claim. Also treat any sentence narrating
a personal experience ("I cut my budget…") as an unsupported claim — it is a fabricated
testimonial. Score accuracy from that list: if anything is supported:false, accuracy cannot
exceed 50, the verdict cannot be "approve", and you must fix it in final_body.

THEN score the rest 0-100 and be a hard marker.

Reject-level problems, each a "high" severity issue. Fix every one in final_body, do not
merely note it:
- Any number, percentage, customer count, rating, award or credential not in can_claim.
- Any statement that contradicts a can_claim item — check how the product is described in the
  post against how can_claim describes it, step by step. A post that gets the mechanics wrong
  fails accuracy no matter how well it reads.
- Any offer the brand never mentioned — free trial, discount, price, guarantee, deadline.
- A fabricated personal story, invented customer, or fake testimonial.
- A medical, financial or legal claim the brand isn't licensed to make.
- Hashtags with hyphens/punctuation, or a post over its platform limit (X: 240 chars).

PLATFORM: ${piece.platform}

DRAFT:
${j({ body: piece.body, hashtags: piece.hashtags })}

WHAT THE BRAND MAY CLAIM:
${canClaim(s.strategy.onboard)}`
  }
};

export const AGENT_LIST = Object.values(AGENTS);

const SYSTEM = (a) => `You are ${a.name}, the ${a.role} agent on raindeer.social — an AI marketing
team that runs research, creative, generation, and review for lean businesses.

Return ONLY a single JSON object, no prose, no markdown fences, matching this shape exactly:

${a.schema}

Write like a sharp human strategist: concrete nouns, short sentences, zero corporate filler.`;

export function buildMessages(agent, state, prior, piece) {
  return [
    { role: 'system', content: SYSTEM(agent) },
    { role: 'user', content: agent.prompt(state, prior, piece) }
  ];
}

// Models tolerate a stray fence or a leading sentence; the UI shouldn't.
export function parseJSON(raw) {
  let t = String(raw).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  const body = t.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(body.replace(/,(\s*[}\]])/g, '$1'));
  }
}

// ── Studio ────────────────────────────────────────────────────────
// The canvas runs all five agents for ONE post, so Keshav needs a
// single-piece brief here rather than the multi-piece campaign plan.
export const STUDIO_CREATIVE = {
  id: 'creative',
  name: 'Keshav',
  role: 'Creative',
  blurb: 'Defines creative direction, formats, hooks, visuals, and platform strategy',
  step: 'studio',
  temperature: 0.8,
  maxTokens: () => 800,
  schema: `{
  "big_idea": "the one idea this post is about, in a sentence",
  "angle": "the specific take — what makes a scroller stop",
  "hooks": ["3 competing first lines, each under 90 characters"],
  "format": "the chosen format for this platform",
  "visual_direction": "art direction a designer could execute from",
  "cta": "the one action we want",
  "tone_notes": "how it should feel to read"
}`,
  prompt: (s) => `Write the creative brief for ONE post. Pick ONE big idea and commit to it —
a brief that hedges produces a post that hedges. Hooks must be openers a real person would
say out loud, not headlines.

Every hook must be sayable by the BRAND's own account. Never write a hook as a customer's
personal story ("I cut my ad spend and my revenue dropped 30%") — that is a fabricated
testimonial with an invented statistic and cannot be published. Address the reader directly,
or state what the brand sees across its users.

WHAT THIS POST IS FOR: ${s.campaign.message}
PLATFORM: ${s.brand.platforms[0]}

BRAND BRAIN:
${brandCard(s.strategy.onboard)}

RESEARCH:
${researchCard(s.strategy.research)}`
};
