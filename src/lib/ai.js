import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getAnthropicKey, getModel, PRICING } from './settings.js'

/* ---------------------------------------------------------------------------
   Grounded event research.

   ONE capability, two entry points:

     researchEvent(url|name)   "I know this event - fill the form in."
     discoverNearTrip(trip)    "I'm already going here - what else is nearby?"

   Both turn open-web text into one structured conference row with its reasoning
   attached. That is the honest answer to "why is AI right for this job": the
   source material is unstructured prose scattered across organiser sites, and
   the output is a judgement about audience composition. No rule extracts that,
   and no salesperson is going to do it by hand for forty events a year.

   Three things this deliberately does NOT do:

   - It does not save anything. Every result is a draft a human edits and
     commits. The model proposes, the rep disposes.
   - It does not answer from memory. web_search and web_fetch are mandatory, and
     every event comes back with the source it was read from, because a model
     recalling conference dates from training data invents them confidently.
   - It does not claim dates are confirmed. Everything lands as `estimated`
     until a person has checked the organiser's own page.
--------------------------------------------------------------------------- */

// Chosen in Settings. See MODELS in settings.js for why it is a choice at all.

/* ---------------------------------------------------------------------------
   COST CONTROLS - read this before loosening anything below.

   The first version of this file burned about $5 in two calls. Three mistakes
   compounded:

   1. web_fetch had no max_content_tokens, so an entire conference site - agenda,
      speaker list and all - came back per fetch.
   2. Up to 5 of those accumulated in one conversation.
   3. Every `pause_turn` re-sends the WHOLE conversation for a fresh inference
      pass, so that accumulated context was re-billed on each of up to 6 turns.

   Cost is therefore not linear in the tool budget, it compounds. Each number
   below is load-bearing.
--------------------------------------------------------------------------- */

const RESEARCH_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
  {
    type: 'web_fetch_20260209',
    name: 'web_fetch',
    max_uses: 2,
    // The single most important number here. Dates, venue, attendance and
    // audience mix all live near the top of an event page; the other 40k tokens
    // are a speaker grid we pay to read and never use.
    max_content_tokens: 6000,
  },
]

/* Fact-gathering, not hard reasoning. `high` is the default and buys
 * deliberation this task does not need, charged in thinking tokens. */
const EFFORT = 'low'

/* Each extra turn re-bills everything read so far. Two searches and a fetch
 * should finish inside three. */
const MAX_TURNS = 3

/** Approximate spend for one call, so cost is visible rather than a surprise. */
function estimateCost(usage, model) {
  if (!usage) return null
  const price = PRICING[model] ?? PRICING['claude-opus-5']
  const inputTokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  const usd =
    (inputTokens / 1e6) * price.input + ((usage.output_tokens ?? 0) / 1e6) * price.output
  return { inputTokens, outputTokens: usage.output_tokens ?? 0, usd }
}

/** Turn SDK and API failures into something a salesperson can act on. */
function friendlyError(err) {
  const raw = err?.message || String(err)
  if (/credit balance is too low/i.test(raw)) {
    return 'Your Anthropic account is out of credit. Top it up under Plans & Billing at console.anthropic.com, then try again.'
  }
  if (/authentication|invalid x-api-key|\b401\b/i.test(raw)) {
    return 'That API key was rejected. Check it in Settings — keys start with sk-ant-.'
  }
  if (/rate.?limit|\b429\b/i.test(raw)) {
    return 'Rate limited by the API. Wait a moment and try again.'
  }
  if (/overloaded|\b529\b|\b50\d\b/.test(raw)) {
    return 'The API is busy right now. Try again in a minute.'
  }
  return raw
}

/* The scoring rubric, in the model's own instructions. It is a near-verbatim
 * restatement of src/lib/scoring.js - including the mistake we made and fixed -
 * because a draft rated on a different rubric than the one that scores it is
 * worse than no draft. */
const RUBRIC = `
Grain sells FX and currency-risk management. Its buyers are:
  - PSPs, acquirers and payfacs (seg_psp)
  - cross-border payments, remittance and money-transfer firms (seg_xborder)
  - travel wholesalers, bedbanks, OTAs and tour operators (seg_travel)
  - corporate treasury and finance teams carrying real FX exposure (seg_fx_exposed)

Rate each segment 0-5 for HOW MUCH OF THE ROOM IT IS, not whether the industry
exists. 0 = nobody, 3 = a fair few, 5 = most of the room.

CRITICAL distinction for seg_fx_exposed. It means treasury and finance people
physically attending. It does NOT mean "companies that have FX exposure". A
travel wholesaler is an FX-exposed business, but the person it sends to a travel
trade show is a contracting or commercial manager buying hotel inventory, not
the CFO who signs a hedging contract. Travel trade shows should score HIGH on
seg_travel and LOW (0-2) on seg_fx_exposed. Rating both high double-counts the
same people and wrongly ranks travel shows above payments events.

buyer_seniority (0-5): are people who can SIGN AN FX CONTRACT there? Senior in
the buying function, not senior generally. A commercial director at a travel
show is senior and cannot sign this; a founder at a small PSP can.

commercial_intent (0-5): 0 = talks only, 3 = mixed, 5 = built around booked
meetings and an expo floor where deals actually happen.

cost_tier (1-5): 1 = passes and a flight, 5 = flagship annual spend.

est_attendance: use the organiser's published figure, but note in the reasoning
if it looks like a marketing number (it usually includes exhibitor staff).
`.trim()

const EventDraft = z.object({
  name: z.string().describe('Official event name'),
  start_date: z.string().describe('YYYY-MM-DD'),
  end_date: z.string().describe('YYYY-MM-DD'),
  city: z.string(),
  country: z.string(),
  region: z.enum(['NA', 'EMEA', 'APAC', 'LATAM']),
  latitude: z.number().describe('Approximate venue latitude'),
  longitude: z.number().describe('Approximate venue longitude'),
  vertical: z.enum(['payments', 'treasury', 'travel', 'fintech', 'banking', 'fx', 'saas']),
  est_attendance: z.number().int(),
  seg_psp: z.number().int().min(0).max(5),
  seg_xborder: z.number().int().min(0).max(5),
  seg_travel: z.number().int().min(0).max(5),
  seg_fx_exposed: z.number().int().min(0).max(5),
  buyer_seniority: z.number().int().min(0).max(5),
  commercial_intent: z.number().int().min(0).max(5),
  cost_tier: z.number().int().min(1).max(5),
  website: z.string(),
  notes: z.string().describe('Two sentences: who is in the room and why Grain should care.'),
  reasoning: z.object({
    segments: z.string().describe('Why those four segment ratings, citing what you read.'),
    seniority: z.string(),
    attendance: z.string().describe('Where the figure came from and whether to trust it.'),
  }),
  source_url: z.string().describe('The page these facts were actually read from.'),
  dates_confidence: z.enum(['high', 'medium', 'low'])
    .describe('low if the page was stale, ambiguous, or the dates came from a third-party listing'),
})

const DiscoveryResult = z.object({
  events: z.array(EventDraft).max(6),
  searched: z.string().describe('One sentence on what you looked for and where.'),
})

function client() {
  const apiKey = getAnthropicKey()
  if (!apiKey) throw new Error('No Anthropic API key set. Add one in Settings.')
  // See the note in settings.js: the key is the user's own, lives in their
  // browser, and travels only to Anthropic.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

/**
 * Run one research request and return the parsed result.
 *
 * Server tools can end a turn with stop_reason 'pause_turn' on long searches.
 * The SDK does not auto-resume that, and an unresumed pause returns a silently
 * truncated answer rather than an error - so the loop below pushes the paused
 * turn back and continues.
 */
async function research({ schema, system, prompt }) {
  const anthropic = client()
  const model = getModel()
  const messages = [{ role: 'user', content: prompt }]
  const spend = { inputTokens: 0, outputTokens: 0, usd: 0, turns: 0, model }

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.parse({
        model,
        max_tokens: 8000,
        system,
        tools: RESEARCH_TOOLS,
        messages,
        output_config: { format: zodOutputFormat(schema), effort: EFFORT },
      })

      // Accumulate across turns - a resumed turn is billed again in full.
      const turnCost = estimateCost(response.usage, model)
      if (turnCost) {
        spend.inputTokens += turnCost.inputTokens
        spend.outputTokens += turnCost.outputTokens
        spend.usd += turnCost.usd
      }
      spend.turns = turn + 1

      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content })
        continue
      }
      if (response.stop_reason === 'refusal') {
        throw new Error('The model declined this request.')
      }
      if (!response.parsed_output) {
        throw new Error('The model did not return a usable result. Try again.')
      }
      return { ...response.parsed_output, _spend: spend }
    }
  } catch (err) {
    throw new Error(friendlyError(err))
  }

  throw new Error(
    `Gave up after ${MAX_TURNS} rounds of searching without a complete answer ` +
    `(about $${spend.usd.toFixed(2)} spent). Try a more specific event name or URL.`,
  )
}

/** "Here is an event — fill in the form." Accepts a URL or just a name. */
export async function researchEvent(input) {
  const isUrl = /^https?:\/\//i.test(input.trim())
  return research({
    schema: EventDraft,
    system: `You research business conferences for a sales team and return structured facts.\n\n${RUBRIC}\n\nAlways use web_search and web_fetch to read the real event page. Never answer from memory: conference dates change every year and a recalled date is a wrong date.`,
    prompt: isUrl
      ? `Research this conference and fill in every field.\n\nURL: ${input.trim()}\n\nFetch that page. If it lacks dates, venue or attendance, search for the official site and this year's edition. Report what you actually read, and set dates_confidence honestly.`
      : `Research the conference called "${input.trim()}" and fill in every field. Find its official site and the NEXT upcoming edition — not a past one. If several events share this name, pick the largest and say which in the notes.`,
  })
}

/**
 * "I'm already going to these — what else is nearby?"
 *
 * The anchored version of conference discovery. Open-ended "find me fintech
 * events" invites the model to invent plausible-sounding events with invented
 * dates. Anchoring to a trip that already exists makes the question narrow,
 * checkable, and tied to a real decision: the flight is paid for, so what else
 * can it cover?
 */
export async function discoverNearTrip({ events, existingNames, radiusKm = 1500, windowDays = 10 }) {
  const anchor = events
    .map((e) => `- ${e.name}, ${e.city} (${e.country}), ${e.start_date} to ${e.end_date}`)
    .join('\n')

  return research({
    schema: DiscoveryResult,
    system: `You find business conferences a sales team does not already know about.\n\n${RUBRIC}\n\nAlways use web_search and web_fetch. Never list an event from memory — verify each one exists on a real page with real dates, and give the URL you read it from. It is far better to return two verified events than six plausible ones.`,
    prompt:
      `A Grain rep is already travelling for:\n\n${anchor}\n\n` +
      `Find up to 4 OTHER conferences that could be added to this same trip: within about ${radiusKm} km ` +
      `and starting within ${windowDays} days before or after, so one journey covers both.\n\n` +
      `Prioritise events where Grain's buyers actually are — payments, cross-border, treasury, travel trade. ` +
      `A small, dense event beats a big irrelevant one.\n\n` +
      `Already on our calendar, do NOT return these:\n${existingNames.join(', ')}\n\n` +
      `If nothing genuinely qualifies, return an empty list. An empty answer is useful; a padded one is not.`,
  })
}
