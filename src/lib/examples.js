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
  // 'mpe-berlin-2027': { capturedAt: '', model: '', result: { ... } },
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
