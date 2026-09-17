import { SIGNALS } from './signals.js'
import { parseDate } from './format.js'

/* ---------------------------------------------------------------------------
   Relationship arc
   ---------------------------------------------------------------------------
   The brief's actual question: is a repeat contact a warming relationship worth
   closing, or a polite tire-kicker who has been listening for a year?

   "Met 3 times" cannot answer that. Three meetings with rising intent is the
   best lead on the board; three meetings of pleasant nothing is a rep wasting
   the same twenty minutes annually. The COUNT IS THE INPUT. The output is a
   direction, and the reasoning that produced it.

   Four things carry the signal:

     MOMENTUM      are the commercial signals stronger than they were?
     TEMPERATURE   did the rep's own read of the person improve or decay?
     AUTHORITY     did they get promoted, or move somewhere bigger? A new title
                   or employer means new budget and new authority - it resets a
                   stalled relationship into a live one.
     RECENCY       intent decays. A hot lead from fourteen months ago is not a
                   hot lead, it is a dropped ball.

   Every verdict carries its reasons, because a verdict a rep cannot interrogate
   is a verdict they will ignore the first time it disagrees with them.
--------------------------------------------------------------------------- */

const SIGNAL_WEIGHT = Object.fromEntries(SIGNALS.map((s) => [s.id, s.weight]))
const TEMP_VALUE = { hot: 3, warm: 2, cold: 1 }

/** Signals that mean a real buying process, not enthusiasm. */
const COMMERCIAL = new Set(['requested_demo', 'named_timeline', 'named_budget'])

/* Labels are written to be understood without sales jargon. "Tire-kicker" is an
 * English idiom about kicking a car's tyres without buying - the brief uses it,
 * but a rep reading a list at a glance should not have to decode an idiom, and
 * plenty of the people using this will not be native speakers. `meaning` is the
 * one-line explanation the UI shows on hover, so a label never has to carry the
 * whole idea on its own. */
export const VERDICTS = {
  new: {
    label: 'First meeting', tone: 'neutral',
    meaning: 'Met once. Too early to read a direction.',
  },
  warming: {
    label: 'Warming', tone: 'good',
    meaning: 'Engagement is rising meeting on meeting, but nobody has asked them to buy yet.',
  },
  ready: {
    label: 'Ready to close', tone: 'good',
    meaning: 'Asked for a demo, a timeline or a budget at the most recent meeting.',
  },
  stalled: {
    label: 'Not moving', tone: 'warn',
    meaning: 'Interested and repeatedly engaged, but the same conversation keeps happening.',
  },
  tire_kicker: {
    label: 'Not buying', tone: 'bad',
    meaning: 'Friendly across many meetings and many months, but has never once asked a commercial question.',
  },
  dormant: {
    label: 'Gone quiet', tone: 'warn',
    meaning: 'Was engaged, sometimes very - then months of silence. Usually our side dropped it.',
  },
  revived: {
    label: 'New role', tone: 'good',
    meaning: 'Changed employer since we last met, which means a new budget and a fresh evaluation.',
  },
}

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000)
const encounterScore = (e) =>
  (e.signals || []).reduce((sum, s) => sum + (SIGNAL_WEIGHT[s] ?? 0), 0)

/**
 * Analyse one contact's encounter history.
 * @param encounters - rows ordered oldest first, each with met_on, signals,
 *                     temperature, title_at_time, company_at_time.
 */
export function analyseArc(encounters, today = new Date().toISOString().slice(0, 10)) {
  const list = [...(encounters || [])].sort((a, b) => a.met_on.localeCompare(b.met_on))
  if (!list.length) return null

  const first = list[0]
  const last = list[list.length - 1]
  const count = list.length
  const spanDays = daysBetween(first.met_on, last.met_on)
  const daysSinceLast = daysBetween(last.met_on, today)

  const scores = list.map(encounterScore)
  const momentum = scores[scores.length - 1] - scores[0]
  const peakScore = Math.max(...scores)
  const tempDelta = (TEMP_VALUE[last.temperature] ?? 2) - (TEMP_VALUE[first.temperature] ?? 2)

  const everCommercial = list.some((e) => (e.signals || []).some((s) => COMMERCIAL.has(s)))
  const recentCommercial = (last.signals || []).some((s) => COMMERCIAL.has(s))
  const browsingCount = list.filter((e) => (e.signals || []).includes('just_browsing')).length

  const titleChanged = first.title_at_time && last.title_at_time &&
    first.title_at_time !== last.title_at_time
  const companyChanged = first.company_at_time && last.company_at_time &&
    first.company_at_time !== last.company_at_time

  const reps = [...new Set(list.map((e) => e.rep_id).filter(Boolean))]

  const facts = {
    count, spanDays, daysSinceLast, momentum, tempDelta, peakScore,
    everCommercial, recentCommercial, browsingCount,
    titleChanged, companyChanged, reps,
    firstTitle: first.title_at_time, lastTitle: last.title_at_time,
    firstCompany: first.company_at_time, lastCompany: last.company_at_time,
  }

  const { verdict, reasons } = judge(facts)
  return { ...facts, verdict, reasons, nextMove: nextMove(verdict, facts) }
}

function judge(f) {
  const reasons = []

  if (f.count === 1) {
    return { verdict: 'new', reasons: ['Only met once so far'] }
  }

  /* Recency first. Intent decays, and a stale strong signal is a different
   * problem from a weak one - it means WE dropped it, which is actionable in a
   * way that a genuinely cold lead is not. */
  if (f.daysSinceLast > 240) {
    reasons.push(`No contact for ${Math.round(f.daysSinceLast / 30)} months`)
    if (f.everCommercial) {
      reasons.push('Previously asked for a demo or named a budget - this went cold on our side')
    }
    return { verdict: 'dormant', reasons }
  }

  /* A promotion or a move outranks everything below it. New authority and a new
   * budget can revive a relationship that looked dead on its previous numbers,
   * so it is checked before the tire-kicker test rather than after. */
  if (f.companyChanged) {
    reasons.push(`Moved from ${f.firstCompany} to ${f.lastCompany}`)
    reasons.push('New employer means a new budget and a fresh evaluation')
    return { verdict: 'revived', reasons }
  }

  /* Tire-kicker: repeated contact over a long stretch that never once turned
   * commercial. The browsing marker is what makes this detectable - without an
   * honest "no intent" signal every meeting looks like progress. */
  if (f.count >= 3 && f.spanDays >= 240 && !f.everCommercial) {
    reasons.push(`${f.count} meetings across ${Math.round(f.spanDays / 30)} months`)
    reasons.push('Never asked for pricing terms, a demo, a timeline or a budget')
    if (f.browsingCount >= 2) reasons.push(`Logged as just browsing ${f.browsingCount} times`)
    if (f.tempDelta <= 0) reasons.push('No improvement in how the conversation reads')
    return { verdict: 'tire_kicker', reasons }
  }

  if (f.recentCommercial && f.momentum > 0) {
    reasons.push('Latest meeting was the most committed yet')
    if (f.titleChanged) reasons.push(`Promoted: ${f.firstTitle} → ${f.lastTitle}`)
    reasons.push('Asked for a demo, a timeline or a budget at the last meeting')
    return { verdict: 'ready', reasons }
  }

  if (f.momentum > 0 || f.tempDelta > 0) {
    reasons.push(`${f.count} meetings, and engagement is rising`)
    if (f.titleChanged) reasons.push(`Promoted: ${f.firstTitle} → ${f.lastTitle}`)
    if (f.tempDelta > 0) reasons.push('Reading warmer than the first meeting')
    return { verdict: 'warming', reasons }
  }

  reasons.push(`${f.count} meetings with no change in what is being asked`)
  if (f.everCommercial) reasons.push('Has asked commercial questions, but never progressed past them')
  if (f.tempDelta === 0) reasons.push('Same read every time')
  return { verdict: 'stalled', reasons }
}

/* The nudge. The brief is explicit that too aggressive is noise and too subtle
 * is invisible - so the tool never nags, it answers one question: given what
 * this history actually shows, what is the single next action? Including, for
 * a tire-kicker, the action of stopping. */
function nextMove(verdict, f) {
  switch (verdict) {
    case 'ready':
      return 'Book the meeting before the event, not after. They have told you the timeline - work backwards from it.'
    case 'warming':
      return 'Ask a commercial question at the next meeting. They are engaged and nobody has asked them to buy anything.'
    case 'revived':
      return `Treat this as a new opportunity, not a continuation. Ask what the FX setup looks like at ${f.lastCompany}.`
    case 'tire_kicker':
      return 'Stop investing booth time here. Say hello, keep it to five minutes, spend the hour on someone who has asked a commercial question.'
    case 'dormant':
      return 'Re-open before the next event, with a reason. They were ready once and we let it lapse - acknowledge that rather than starting over.'
    case 'stalled':
      return 'Change the question. The same conversation has happened repeatedly, so something unspoken is blocking it - ask what would have to be true to move forward.'
    default:
      return 'Too early to read. One more meeting will tell you the direction.'
  }
}
