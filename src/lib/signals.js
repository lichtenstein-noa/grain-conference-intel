/* ---------------------------------------------------------------------------
   The capture vocabulary.

   Kept in its own module with no dependencies because two very different things
   need it: the capture screen renders it as tappable chips, and the arc analysis
   reads the weights to judge a relationship. Neither should have to import a
   database client to find out what a signal means.

   These chips exist to do two jobs with one interaction. On the floor they are
   faster than typing - one thumb, no keyboard, legible at arm's length.
   Afterwards they are the structured input the interpretation runs on, so the
   rep gets a judgement later without having done extra work at the time.
--------------------------------------------------------------------------- */

export const SIGNALS = [
  { id: 'asked_pricing',        label: 'Asked pricing',       weight:  2 },
  { id: 'requested_demo',       label: 'Wants a demo',        weight:  3 },
  { id: 'named_timeline',       label: 'Gave a timeline',     weight:  3 },
  { id: 'named_budget',         label: 'Named a budget',      weight:  3 },
  { id: 'they_initiated',       label: 'They approached us',  weight:  2 },
  { id: 'brought_colleague',    label: 'Brought a colleague', weight:  2 },
  { id: 'competitor_mentioned', label: 'Named a competitor',  weight:  1 },

  /* Negative on purpose. Without an honest "polite conversation, no intent"
   * marker every encounter looks like progress, and the tire-kicker detection
   * has nothing to work with. This one chip is what makes the difference
   * between counting meetings and reading them. */
  { id: 'just_browsing',        label: 'Just browsing',       weight: -2 },
]

export const TEMPERATURES = [
  { id: 'hot',  label: 'Hot' },
  { id: 'warm', label: 'Warm' },
  { id: 'cold', label: 'Cold' },
]
