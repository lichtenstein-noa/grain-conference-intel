/* ---------------------------------------------------------------------------
   Name normalisation - the key that makes the same human recognisable across
   conferences twelve months apart.

   The real inputs are messy in predictable ways: a badge says "Bob Chen", the
   rep types "Robert Chen" next year, someone types "chen, robert", an accent
   gets dropped, a double-barrelled surname loses its hyphen. Normalising to a
   single comparable key handles all of that before any fuzzy matching runs.
--------------------------------------------------------------------------- */

/* Common English given-name variants, folded to one canonical form. Deliberately
 * not exhaustive - it covers the collisions a payments/travel sales team in
 * Europe and North America will actually hit. A production version would add
 * per-locale sets rather than growing this one forever. */
const NICKNAMES = {
  rob: 'robert', bob: 'robert', bobby: 'robert', robbie: 'robert',
  mike: 'michael', mick: 'michael', mikey: 'michael',
  bill: 'william', will: 'william', billy: 'william', liam: 'william',
  dave: 'david', davey: 'david',
  jim: 'james', jimmy: 'james', jamie: 'james',
  tom: 'thomas', tommy: 'thomas',
  rick: 'richard', rich: 'richard', dick: 'richard', richie: 'richard',
  chris: 'christopher', kit: 'christopher',
  kate: 'katherine', katie: 'katherine', kathy: 'katherine',
  cathy: 'katherine', catherine: 'katherine', kath: 'katherine',
  liz: 'elizabeth', beth: 'elizabeth', lizzie: 'elizabeth', betty: 'elizabeth',
  sue: 'susan', suzy: 'susan', susie: 'susan',
  steve: 'stephen', steven: 'stephen',
  matt: 'matthew', dan: 'daniel', danny: 'daniel',
  nick: 'nicholas', tony: 'anthony',
  alex: 'alexander', sandy: 'alexander',
  sam: 'samuel', ben: 'benjamin', benny: 'benjamin',
  joe: 'joseph', joey: 'joseph',
  jon: 'jonathan', john: 'jonathan', johnny: 'jonathan',
  ed: 'edward', eddie: 'edward', ted: 'edward',
  andy: 'andrew', drew: 'andrew',
  greg: 'gregory', ken: 'kenneth', kenny: 'kenneth',
  larry: 'lawrence', ron: 'ronald', charlie: 'charles', chuck: 'charles',
  pete: 'peter', phil: 'philip', ray: 'raymond',
  gabe: 'gabriel', vinny: 'vincent', walt: 'walter',
  fran: 'francis', frank: 'francis',
  pat: 'patrick', paddy: 'patrick',
  abe: 'abraham', art: 'arthur', bert: 'albert', al: 'albert',
  nat: 'nathaniel', nate: 'nathaniel',
  tim: 'timothy', tim0thy: 'timothy',
  vicky: 'victoria', vic: 'victoria',
  maggie: 'margaret', peggy: 'margaret', meg: 'margaret',
  jen: 'jennifer', jenny: 'jennifer',
  becky: 'rebecca', becca: 'rebecca',
  mandy: 'amanda', sandy2: 'sandra',
}

/** Strip accents, punctuation and case; collapse whitespace. */
export function simplify(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // combining accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')      // hyphens, apostrophes, commas, dots
    .replace(/\s+/g, ' ')
    .trim()
}

/* Titles and suffixes that show up on badges and in signatures but say nothing
 * about identity. Removed before comparison so "Dr. Anna Weiss" and "Anna
 * Weiss" collapse to the same key. */
const NOISE = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'dame',
  'jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'mba', 'cfa', 'cpa',
])

/**
 * Produce the comparison key for a person's name.
 * Tokens are sorted, so "Chen, Robert" and "Robert Chen" agree - badge exports
 * flip name order constantly and it is not a signal of a different person.
 */
export function normalizeName(raw) {
  const tokens = simplify(raw)
    .split(' ')
    .filter((t) => t && !NOISE.has(t))
    .map((t) => NICKNAMES[t] || t)

  return tokens.sort().join(' ')
}

/** Normalise a company name for comparison: drops the legal-suffix noise that
 *  makes "Acme Payments Ltd" and "Acme Payments" look like different firms. */
const COMPANY_NOISE = new Set([
  'ltd', 'limited', 'llc', 'inc', 'incorporated', 'corp', 'corporation',
  'plc', 'gmbh', 'ag', 'bv', 'nv', 'sa', 'srl', 'spa', 'oy', 'ab', 'as',
  'pte', 'pty', 'co', 'company', 'group', 'holdings', 'international',
  'the', 'and',
])

export function normalizeCompany(raw) {
  return simplify(raw)
    .split(' ')
    .filter((t) => t && !COMPANY_NOISE.has(t))
    .join(' ')
}
