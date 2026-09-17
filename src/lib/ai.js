import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getAnthropicKey, getModel, PRICING } from './settings.js'
import { distanceKm } from './planning.js'

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
    // Enough to verify what we actually ask for. The first version wanted up to
    // four verified events while allowing two fetches - a contradiction the
    // model burned its whole turn budget failing to satisfy.
    max_uses: 4,
    // The single most important number here. Dates, venue, attendance and
    // audience mix all live near the top of an event page; the other 40k tokens
    // are a speaker grid we pay to read and never use.
    max_content_tokens: 6000,
  },
]

/* `high` is the default and buys deliberation this does not need. But `low` was
 * a false economy on the multi-step discovery path: too little planning means
 * badly-chosen searches, which means more of them, which costs more than the
 * thinking would have. Medium plans once and searches well. */
const EFFORT = 'medium'

/* Search strategy, rather than a blanket "go slowly".
 *
 * Firing many searches at once trips the per-account rate limit on a new
 * account, and the failure mode is nasty: nothing can be verified, the model
 * correctly refuses to invent events, and an empty result comes back - so a
 * rate limit looks exactly like "found nothing". The first fix ordered strictly
 * one-at-a-time searching, which avoided the limit and took six minutes.
 * Naming the query shape is better: well-aimed searches need fewer attempts. */
const SEQUENTIAL = `
Search deliberately, not broadly. Plan queries before you start and name the
country and month: "payments conference Germany March 2027", "treasury event
Netherlands June 2027". A few well-aimed searches beat many scattered ones, and
firing several at once trips a rate limit.

Stop as soon as you have what was asked for. You do not have to spend your full
search budget.
`.trim()

/* Each extra turn re-bills everything read so far. Two searches and a fetch
 * should finish inside three. */
const MAX_TURNS = 3

/* Per-turn wall clock. Nobody watches a spinner longer than this, and a request
 * still running past it is wandering rather than working. The SDK's own default
 * is ten minutes, which is far too patient for something a person is sat
 * watching. */
const TURN_TIMEOUT_MS = 90_000

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
    return 'That API key was rejected. Check it in Settings - keys start with sk-ant-.'
  }
  if (/rate.?limit|\b429\b/i.test(raw)) {
    return 'Rate limited by the API. Wait a moment and try again.'
  }
  if (/overloaded|\b529\b|\b50\d\b/.test(raw)) {
    return 'The API is busy right now. Try again in a minute.'
  }
  if (/timeout|timed out|aborted/i.test(raw)) {
    return 'That search ran too long and was stopped. Open-ended discovery is slow and unreliable on a low-tier API account - looking a single event up by URL is much faster.'
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

/* Step one of discovery: candidate names only, from memory, with no tools.
 *
 * Deliberately unverified. Recalling "MPE and ITB are both in Berlin in March"
 * takes seconds and costs almost nothing; the dates that come with that recall
 * are worthless and we throw them away. Verification happens in step two,
 * against the live web. Anything imagined simply fails to verify. */
const CandidateList = z.object({
  candidates: z.array(z.object({
    name: z.string().describe('Event name as it is actually known'),
    city: z.string().describe('Where you believe it runs'),
    why: z.string().describe('One line: why this fits Grain and this trip'),
  })).max(5),
  reasoning: z.string().describe('One sentence on how you chose.'),
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
async function research({ schema, system, prompt, tools = RESEARCH_TOOLS }) {
  const anthropic = client()
  const model = getModel()
  const messages = [{ role: 'user', content: prompt }]
  const spend = { inputTokens: 0, outputTokens: 0, usd: 0, turns: 0, model }

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      /* A hard wall-clock limit.
       *
       * Single-event research finishes in under a minute. Open-ended discovery
       * can wander: the model keeps searching, refining and re-searching, and
       * with no ceiling it simply runs - eight minutes observed, on a task worth
       * about ninety seconds. The SDK's own default is ten minutes, which is far
       * too patient for anything a person is sitting and watching.
       *
       * Failing fast and saying so beats a spinner that might finish. */
      const response = await anthropic.messages.parse({
        model,
        max_tokens: 8000,
        system,
        // Omitted entirely when empty - the recall step runs with no tools at
        // all, and an empty array is not the same thing as absent.
        ...(tools.length ? { tools } : {}),
        /* NOTE: tool_choice.disable_parallel_tool_use is rejected here with a
         * 400. The _20260209 search and fetch tools run code execution under the
         * hood for dynamic filtering, which counts as programmatic tool calling,
         * and the two features are mutually exclusive. Pacing is asked for in the
         * prompt instead - see SEQUENTIAL below. */
        messages,
        output_config: { format: zodOutputFormat(schema), effort: EFFORT },
      }, { timeout: TURN_TIMEOUT_MS })

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

/** "Here is an event - fill in the form." Accepts a URL or just a name. */
export async function researchEvent(input, { targetWindow = null } = {}) {
  const isUrl = /^https?:\/\//i.test(input.trim())

  /* Which EDITION to look up.
   *
   * "The next upcoming one" is right when someone is adding an event they know
   * about. It is wrong when verifying a discovery candidate, where we care about
   * the edition near a specific trip - the first version dutifully returned
   * FinovateEurope 2026 while checking a March 2027 trip, then failed its own
   * date check. */
  const edition = targetWindow
    ? `\n\nIMPORTANT: find the edition running closest to ${targetWindow}, NOT simply the next upcoming one. If no edition runs near then, say so in the notes and give the nearest edition you can confirm.`
    : ''

  return research({
    schema: EventDraft,
    system: `You research business conferences for a sales team and return structured facts.\n\n${RUBRIC}\n\nAlways use web_search and web_fetch to read the real event page. Never answer from memory: conference dates change every year and a recalled date is a wrong date.

${SEQUENTIAL}`,
    prompt: isUrl
      ? `Research this conference and fill in every field.\n\nURL: ${input.trim()}\n\nFetch that page. If it lacks dates, venue or attendance, search for the official site and this year's edition. Report what you actually read, and set dates_confidence honestly.` + edition
      : `Research the conference called "${input.trim()}" and fill in every field. Find its official site and ${targetWindow ? 'the relevant edition' : 'the NEXT upcoming edition - not a past one'}. If several events share this name, pick the largest and say which in the notes.` + edition,
  })
}

/**
 * "I'm already going to these - what else is nearby?"
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

  /* The window the geometry check will actually enforce, computed once and
   * stated to both steps. Recall used to be told "around the same time of year"
   * and offered February events for a March trip; verification used to look for
   * "the next upcoming edition" and returned FinovateEurope 2026 while checking
   * a 2027 trip. Both wasted a verification call learning what the calendar
   * already knew. */
  const starts = events.map((e) => e.start_date).sort()
  const ends = events.map((e) => e.end_date).sort()
  const windowStart = shiftIso(starts[0], -windowDays)
  const windowEnd = shiftIso(ends[ends.length - 1], windowDays)
  const targetWindow = `${windowStart} to ${windowEnd}`

  /* STEP 1 - recall. No tools, so this returns in a few seconds.
   *
   * Earlier versions asked one call to both find AND verify candidates, and it
   * wandered for eight minutes: search, evaluate, refine, search again. The two
   * halves want opposite things. Finding is open-ended and does not need to be
   * right. Verifying is narrow and has to be exactly right. Split apart, each
   * half is easy. */
  const recalled = await research({
    schema: CandidateList,
    tools: [],
    system:
      `You know the international business conference circuit well.

${RUBRIC}

` +
      `Name events from memory. Do NOT worry about exact dates - they will be checked ` +
      `against the organiser's own site afterwards, and anything you misremember is dropped ` +
      `then. Your job is only to think of the right candidates.`,
    prompt:
      `A Grain rep is already travelling for:

${anchor}

` +
      `Which other conferences run in or near that COUNTRY AND REGION, starting between ` +
      `${windowStart} and ${windowEnd}, that Grain's buyers attend - payments, cross-border, ` +
      `treasury, or travel trade?

The date window is strict: an event that normally runs ` +
      `in a different month does not qualify, however relevant it is otherwise. Think about ` +
      `which month each event you name actually runs in before suggesting it.

` +
      `Think about the country and the surrounding region, not just the exact city. Name up ` +
      `to 5. A small dense event beats a big irrelevant one.

` +
      `Already on our calendar, do not suggest these:
${existingNames.join(', ')}`,
  })

  const seen = new Set(existingNames.map((n) => n.toLowerCase()))
  const shortlist = (recalled.candidates || [])
    .filter((c) => !seen.has(c.name.toLowerCase()))
    .slice(0, 2)

  /* STEP 2 - verify each candidate through the single-event path that already
   * works reliably, because it is given a specific target rather than an
   * open question. One failure does not sink the batch. */
  const verified = []
  const ruledOut = []
  for (const c of shortlist) {
    try {
      const draft = await researchEvent(`${c.name} ${c.city}`.trim(), { targetWindow })
      verified.push(draft)
    } catch (err) {
      // Could not be confirmed at all - still reported, so the rep sees what was
      // considered rather than only what survived.
      ruledOut.push({ name: c.name, detail: c.city, why: `could not verify: ${err.message}` })
    }
  }

  /* STEP 3 - proximity, checked in CODE rather than trusted to the model.
   *
   * We have real coordinates and real dates by now, so "is this actually near
   * that trip" is arithmetic. Asking a model to respect a 1,500 km radius is
   * asking it to do geometry in its head; this way a confidently-wrong answer
   * simply fails the check.
   *
   * Anything ruled out is kept, with the measurement that ruled it out and a
   * link. A rep should be able to disagree with a rejection - "too far away,
   * trust me" is exactly the kind of claim this tool should not be making. */
  const near = []
  for (const d of verified) {
    let bestKm = null
    let bestGap = null

    for (const e of events) {
      const km = distanceKm(e, { latitude: d.latitude, longitude: d.longitude, city: d.city })
      const gap = Math.min(
        Math.abs(daysBetweenIso(e.end_date, d.start_date)),
        Math.abs(daysBetweenIso(d.end_date, e.start_date)),
      )
      if (bestKm === null || (km !== null && km < bestKm)) bestKm = km
      if (bestGap === null || gap < bestGap) bestGap = gap
    }

    const fitsDistance = bestKm !== null && bestKm <= radiusKm
    const fitsDates = bestGap !== null && bestGap <= windowDays

    if (fitsDistance && fitsDates) {
      near.push({ ...d, _km: bestKm, _gap: bestGap })
    } else {
      const why = []
      if (!fitsDistance) {
        why.push(bestKm === null
          ? 'no location we could place'
          : `${bestKm.toLocaleString()} km away, over the ${radiusKm.toLocaleString()} km limit`)
      }
      if (!fitsDates) why.push(`${bestGap} days from the trip, over the ${windowDays}-day window`)
      ruledOut.push({
        name: d.name,
        detail: `${d.city} · ${d.start_date} to ${d.end_date}`,
        why: why.join('; '),
        website: d.website || null,
        source_url: d.source_url || null,
      })
    }
  }

  return {
    events: near,
    ruledOut,
    outcome: 'searched_ok',
    searched: `${recalled.reasoning} Checked ${shortlist.length} candidate${shortlist.length === 1 ? '' : 's'} against their own event pages.`,
    _spend: mergeSpend([recalled, ...verified]),
  }
}

/** Shift a YYYY-MM-DD string by N days, staying in local time. */
function shiftIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Whole days between two YYYY-MM-DD strings. */
function daysBetweenIso(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000)
}

/** Discovery makes several calls; report what the whole thing cost, not a leg. */
function mergeSpend(results) {
  const total = { inputTokens: 0, outputTokens: 0, usd: 0, turns: 0 }
  for (const r of results) {
    const sp = r?._spend
    if (!sp) continue
    total.inputTokens += sp.inputTokens
    total.outputTokens += sp.outputTokens
    total.usd += sp.usd
    total.turns += sp.turns
    total.model = sp.model
  }
  return total
}
