import { supabase } from './supabase.js'
import { normalizeName, normalizeCompany } from './names.js'

/* ---------------------------------------------------------------------------
   Is this the same person we met before?

   The governing principle: A SILENT WRONG MERGE IS THE WORST OUTCOME. If the
   tool quietly fuses two different people, the rep is shown a relationship
   history that never happened and acts on it - and they lose trust in every
   other thing the tool says. A missed match is recoverable; a bad merge
   poisons the data and the confidence in it.

   So there are three outcomes, not two:

     certain   link automatically - email match, or same name at the same company
     likely    ASK, with "same person" pre-selected
     possible  ASK, with "different person" pre-selected

   Only `certain` links without a human. The reason is the pair of cases this
   file cannot tell apart: "Robert Okonkwo, who moved from Meridian to Lattice"
   and "a second David Kim who works somewhere else" produce IDENTICAL evidence -
   same name, different employer. One is a promotion worth knowing about, the
   other is two real people being fused into one fictional history. No heuristic
   resolves that, and the rep resolves it in one tap while the person is still in
   sight. So `likely` asks too; it just leans.

   Anything weaker than `possible` creates a new contact silently, which is the
   safe default - a duplicate is tidied up later, a bad merge is not.
--------------------------------------------------------------------------- */

export const CERTAIN = 'certain'
export const LIKELY = 'likely'
export const POSSIBLE = 'possible'

/** Levenshtein distance, iterative with a single row. Names are short, so the
 *  naive version is more than fast enough and much easier to read. */
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,                                   // deletion
        row[j - 1] + 1,                                // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      )
    }
    prev = row
  }
  return prev[b.length]
}

const ratio = (a, b) => (a === b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length))

/** How alike are two name tokens? Handles initials explicitly - "S. Chen" and
 *  "Sarah Chen" are the same person on a badge far more often than not. */
function tokenSimilarity(a, b) {
  if (a === b) return 1
  if (a.length === 1 || b.length === 1) {
    const [initial, full] = a.length === 1 ? [a, b] : [b, a]
    return full.startsWith(initial) ? 0.85 : 0
  }
  const r = ratio(a, b)
  return r >= 0.75 ? r : 0
}

/** 0-1 similarity between two already-normalised names. */
export function nameSimilarity(nameA, nameB) {
  const A = nameA.split(' ').filter(Boolean)
  const B = nameB.split(' ').filter(Boolean)
  if (!A.length || !B.length) return 0

  // Greedy best-match each token of the shorter list against the longer one.
  const [short, long] = A.length <= B.length ? [A, B] : [B, A]
  const taken = new Set()
  let total = 0

  for (const t of short) {
    let best = 0
    let bestIdx = -1
    long.forEach((u, i) => {
      if (taken.has(i)) return
      const s = tokenSimilarity(t, u)
      if (s > best) { best = s; bestIdx = i }
    })
    if (bestIdx >= 0) taken.add(bestIdx)
    total += best
  }

  // Divide by the LONGER list: "Sarah Chen" vs "Sarah Chen-Watanabe" should not
  // score a perfect 1.0 just because every token of the shorter name matched.
  return total / long.length
}

/**
 * Compare one typed person against one stored contact.
 * Returns null when they are not plausibly the same human.
 */
export function scoreMatch(input, contact) {
  const reasons = []

  const typedEmail = input.email?.trim().toLowerCase()
  if (typedEmail && contact.email && typedEmail === contact.email.toLowerCase()) {
    return { contact, score: 1, confidence: CERTAIN, reasons: ['Same email address'] }
  }

  const typedName = normalizeName(input.fullName)
  const sim = nameSimilarity(typedName, contact.normalized_name)

  const typedCo = normalizeCompany(input.company)
  const storedCo = normalizeCompany(contact.current_company)
  const sameCompany = Boolean(typedCo && storedCo && typedCo === storedCo)
  const companyKnown = Boolean(typedCo && storedCo)

  /* CONTEXT RESCUE - the answer to "what about nicknames you have never heard of".
   *
   * The nickname table in names.js is a hard ceiling: it folds bob->robert and
   * richie->richard, and knows nothing about yossi->yosef, nacho->ignacio or
   * sasha->aleksandr. Edit distance does not help either, because a nickname is
   * NOT a typo - "bob" and "robert" share a single letter and score 0%. Every
   * language invents its own, so the list is never finished.
   *
   * But we do not need to know that Yossi means Yosef. We only need to notice
   * that someone sharing a surname at the EXACT same company is worth asking
   * about. Context does what the name alone cannot, and it works for every
   * language without knowing any of them.
   *
   * Capped at POSSIBLE, so the prompt defaults to "different person" - this
   * fires on genuinely unrelated people too (Sarah Chen and David Chen at one
   * employer), and that costs one tap instead of a bad merge. */
  if (sim < 0.75) {
    const typedTokens = typedName.split(' ')
    const storedTokens = contact.normalized_name.split(' ')
    const shared = typedTokens.find((t) => t.length >= 3 && storedTokens.includes(t))

    if (shared && sameCompany) {
      return {
        contact,
        score: 0.5,
        confidence: POSSIBLE,
        reasons: [
          `Shares a name with ${contact.full_name}`,
          `Both at ${contact.current_company}`,
          'Could be a shortened or local form of the same first name',
        ],
      }
    }
    return null
  }

  const exactName = typedName === contact.normalized_name
  reasons.push(
    exactName
      ? 'Same name'
      : `Similar name (${Math.round(sim * 100)}% match to "${contact.full_name}")`,
  )

  if (sameCompany) reasons.push(`Still at ${contact.current_company}`)
  else if (companyKnown) {
    reasons.push(`Different company - was ${contact.current_company}, now ${input.company.trim()}`)
  }

  /* Confidence, most to least certain. Note the deliberate asymmetry: an exact
   * name with a DIFFERENT company is only "likely", never certain, because two
   * separate people sharing a name is exactly what it looks like. A job change
   * and a name collision are indistinguishable from the data alone - so a human
   * decides. */
  let confidence
  if (exactName && sameCompany) confidence = CERTAIN
  else if (exactName && !companyKnown) confidence = LIKELY
  else if (exactName) confidence = LIKELY        // same name, moved employer
  else if (sim >= 0.85 && sameCompany) confidence = LIKELY
  else confidence = POSSIBLE

  return { contact, score: sim, confidence, reasons }
}

/**
 * Find everyone this typed person might be.
 *
 * Pulls a coarse candidate set from the database rather than scanning every
 * contact: anything sharing a surname-ish token, plus an email hit. At sales-
 * team scale the whole table would be fine, but the shape below is the one that
 * still works at fifty thousand contacts.
 */
export async function findCandidates({ fullName, email, company }) {
  if (!fullName?.trim()) return { autoLink: null, candidates: [] }

  const tokens = normalizeName(fullName).split(' ').filter((t) => t.length > 1)
  const filters = tokens.map((t) => `normalized_name.ilike.%${t}%`)
  if (email?.trim()) filters.push(`email.eq.${email.trim().toLowerCase()}`)
  if (!filters.length) return { autoLink: null, candidates: [] }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .or(filters.join(','))
    .limit(25)

  if (error || !data?.length) return { autoLink: null, candidates: [] }

  const scored = data
    .map((c) => scoreMatch({ fullName, email, company }, c))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  const certain = scored.find((m) => m.confidence === CERTAIN)
  if (certain) return { autoLink: certain, candidates: [] }

  return { autoLink: null, candidates: scored.slice(0, 4) }
}
