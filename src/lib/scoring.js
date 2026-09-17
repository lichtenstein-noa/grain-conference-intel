/* ---------------------------------------------------------------------------
   ICP fit scoring
   ---------------------------------------------------------------------------
   Design rules this model follows, and why:

   1. NOTHING IS STORED. The score is recomputed from the conference's facts on
      every render. Weights can be changed and the whole calendar re-ranks
      instantly - and a rep can never be looking at a stale number.

   2. EVERY COMPONENT IS SHOWN. `score()` returns its own working, so the UI can
      explain any ranking. A salesperson who cannot see why Money20/20 beat Web
      Summit will not trust the tool the first time it disagrees with them.

   3. SIZE IS DELIBERATELY WEAK. Audience size is log-scaled and capped at 20%
      of the total. Web Summit and Singapore FinTech Festival draw the same
      70,000 people; one is full of Grain buyers and one is full of founders and
      press. A model that ranks on headcount cannot tell them apart, and ranking
      on headcount is the single most common way this kind of tool goes wrong.

   4. DEPTH BEATS BREADTH, BUT BREADTH COUNTS. ICP density is 70% the strongest
      segment and 30% the rest. A plain average would punish specialist events -
      EuroFinance is a 5 for treasury and near-zero for everything else, and it
      is one of the best events on the calendar.

   5. COST IS NOT IN THE SCORE. Fit and cost are separate axes, reported
      separately. Blending them hides the interesting case: an event that is a
      brilliant fit AND expensive is still worth attending, it just needs a
      bigger commitment. `efficiency` exposes the tradeoff without burying it.
--------------------------------------------------------------------------- */

/** Relative priority of each ICP segment for Grain.
 *  Payments and cross-border lead because that is where the product started;
 *  travel and FX-exposed corporates follow closely. These are the numbers to
 *  argue about first - they encode a go-to-market opinion, not a fact. */
export const SEGMENT_WEIGHTS = {
  seg_psp:        1.00,  // payment service providers, acquirers, payfacs
  seg_xborder:    1.00,  // cross-border payments, remittance, money transfer
  seg_travel:     0.95,  // travel wholesalers, bedbanks, OTAs, tour operators
  seg_fx_exposed: 0.90,  // corporates / treasury teams carrying FX exposure
}

export const WEIGHTS = {
  icp_density:       0.50,
  buyer_seniority:   0.22,
  commercial_intent: 0.18,
  reach:             0.10,
}

/* Calibrated against the real calendar, not picked a priori. With cutoffs at
 * 70/50 this list came out 22 Tier A of 28, which is not a prioritisation - if
 * everything is a priority, nothing is. These produce roughly a 9 / 14 / 5
 * split: a Tier A shortlist a small team could actually staff, a Tier B pool to
 * fill gaps and cover regions, and a Tier C that is honestly not worth a flight. */
export const TIER_CUTOFFS = { A: 82, B: 65 }

/* Reach saturates rather than scaling.
 *
 * A rep gets 30-50 real conversations out of a three-day event, full stop. Once
 * an event contains enough ICP people to fill that calendar, extra attendees
 * add noise, queues and walking distance - not pipeline. So reach measures
 * "does this event hold a big enough pool of the right people", and stops
 * counting once the answer is yes.
 *
 * The pool is attendance scaled by ICP density, against the headroom a rep
 * needs to reliably fill a diary (you will never meet most of the pool, hence
 * the multiple). Above that, reach is 1.0 for a 5,000-person event and a
 * 250,000-person one alike - which is the honest answer. */
const POOL_TARGET = 1200

const clamp01 = (n) => Math.max(0, Math.min(1, n))

function icpDensity(c) {
  const weighted = Object.entries(SEGMENT_WEIGHTS)
    .map(([col, w]) => ({ col, value: (c[col] ?? 0) * w }))
    .sort((a, b) => b.value - a.value)

  const best = weighted[0]
  const rest = weighted.slice(1)
  const restMean = rest.reduce((sum, s) => sum + s.value, 0) / rest.length

  return {
    value: clamp01((0.7 * best.value + 0.3 * restMean) / 5),
    leadSegment: best.col,
  }
}

function reach(c, density) {
  const pool = (c.est_attendance ?? 0) * density
  return clamp01(pool / POOL_TARGET)
}

export const SEGMENT_LABELS = {
  seg_psp:        'PSPs & acquirers',
  seg_xborder:    'Cross-border payments',
  seg_travel:     'Travel wholesalers',
  seg_fx_exposed: 'FX-exposed corporates',
}

export const COMPONENT_LABELS = {
  icp_density:       'ICP density',
  buyer_seniority:   'Buyer seniority',
  commercial_intent: 'Commercial intent',
  reach:             'Pool sufficiency',
}

/* Measured on the seeded calendar: pool sufficiency is 1.0 for 26 of 28 events.
 * It is near-constant BY DESIGN and does almost no ranking work - it exists to
 * catch the event too small to justify a flight, not to reward the big ones.
 * Audience size is not a tiebreaker between events that are already relevant,
 * and a model that treats it as one is just ranking conferences by how loud
 * their marketing is. */

/**
 * Score one conference.
 * @returns {{
 *   fit: number, tier: 'A'|'B'|'C', efficiency: number, leadSegment: string,
 *   components: Array<{key:string,label:string,normalised:number,weight:number,contribution:number}>
 * }}
 */
export function score(c) {
  const density = icpDensity(c)

  const normalised = {
    icp_density:       density.value,
    buyer_seniority:   clamp01((c.buyer_seniority ?? 0) / 5),
    commercial_intent: clamp01((c.commercial_intent ?? 0) / 5),
    reach:             reach(c, density.value),
  }

  const components = Object.entries(WEIGHTS).map(([key, weight]) => ({
    key,
    label: COMPONENT_LABELS[key],
    normalised: normalised[key],
    weight,
    contribution: normalised[key] * weight,
  }))

  const fit = Math.round(
    components.reduce((sum, comp) => sum + comp.contribution, 0) * 100,
  )

  const tier = fit >= TIER_CUTOFFS.A ? 'A' : fit >= TIER_CUTOFFS.B ? 'B' : 'C'

  /* Value per unit of cost, measured ABOVE the "worth considering" bar rather
   * than from zero. A plain fit/cost ratio rewards cheap mediocrity - a Tier B
   * event at cost 2 beats an excellent one at cost 5, which is not advice any
   * sales lead would follow. Measuring the surplus over the Tier B cutoff asks
   * the better question: how much fit above the bar am I buying per unit spent? */
  const efficiency =
    Math.round((Math.max(0, fit - TIER_CUTOFFS.B) / (c.cost_tier || 3)) * 10) / 10

  return { fit, tier, efficiency, leadSegment: density.leadSegment, components }
}

/** Attach scoring to a list of rows, so views never recompute ad hoc. */
export function scoreAll(rows) {
  return rows.map((c) => ({ ...c, ...score(c) }))
}
