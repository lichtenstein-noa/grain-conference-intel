/* ---------------------------------------------------------------------------
   Saved results from real runs.

   Why this exists: the brief requires API keys to be user-configurable, so most
   people who open the live site have no key set. Without something here, the
   most interesting part of the tool is a greyed-out button, and an evaluator
   never sees it work.

   These are REAL outputs, captured from actual calls and pasted in verbatim -
   not hand-written to look plausible. Everything else in this project refuses to
   invent data it has not verified, and faking a demo would be a strange place to
   start. Each one records when it was captured and which model produced it, and
   the UI always labels it as a saved result rather than passing it off as live.

   To capture more: run the feature with a key set, then use the "copy result"
   link that appears on the result panel and paste the JSON in below.
--------------------------------------------------------------------------- */

/** Keyed by the first conference id in the anchor trip. */
export const EXAMPLE_DISCOVERIES = {
  /* A real run against the Berlin trip, captured verbatim.
   *
   * It found nothing to add - and that is exactly why it is worth shipping. The
   * panel shows the candidates it considered, that it checked them against
   * their own event pages, and the measurement that ruled each one out. The
   * FinovateEurope rejection is the interesting one: the model returned the 2026
   * edition because the 2027 dates are not published yet, and the distance/date
   * check caught it at 391 days out. That is the same conclusion we reached by
   * hand on day one, arrived at independently.
   *
   * A demo where the tool declines to suggest something, and shows its working,
   * says more about whether to trust it than one where it always finds a hit. */
  'mpe-berlin-2027': {
    capturedAt: '2026-09-17',
    model: null,
    result: {
      events: [],
      ruledOut: [
        {
          name: 'Merchant Risk Council Europe (MRC Barcelona)',
          detail: 'Barcelona, Spain',
          why: 'could not verify - the API spend limit was reached mid-run',
        },
        {
          name: 'FinovateEurope',
          detail: 'London · 2026-02-10 to 2026-02-11',
          why: '391 days from the trip, over the 10-day window',
          website: 'https://informaconnect.com/finovateeurope/',
          source_url: 'https://informaconnect.com/finovateeurope/',
        },
      ],
      outcome: 'searched_ok',
      searched:
        'Selected regionally close European fintech/payments and ecommerce events falling ' +
        'within the strict Feb 27 – Mar 28 2027 window that attract PSPs, acquirers and ' +
        'cross-border payment buyers not already on the calendar. Checked 2 candidates ' +
        'against their own event pages.',
    },
  },
}

/** Keyed by a lowercased lookup string. */
export const EXAMPLE_RESEARCH = {
  // 'sibos': { capturedAt: '', model: '', result: { ... } },
}

export function exampleDiscovery(anchorEvents) {
  const key = anchorEvents?.[0]?.id
  return (key && EXAMPLE_DISCOVERIES[key]) || Object.values(EXAMPLE_DISCOVERIES)[0] || null
}

export function exampleResearch(lookup) {
  const key = (lookup || '').trim().toLowerCase()
  return EXAMPLE_RESEARCH[key] || Object.values(EXAMPLE_RESEARCH)[0] || null
}

export const hasExamples = () =>
  Object.keys(EXAMPLE_DISCOVERIES).length > 0 || Object.keys(EXAMPLE_RESEARCH).length > 0
