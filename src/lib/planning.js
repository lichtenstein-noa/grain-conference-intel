import { parseDate } from './format.js'

/* ---------------------------------------------------------------------------
   Planning analysis: coverage gaps, trip clusters, calendar conflicts.

   The three questions a sales lead actually asks of a conference calendar:

     1. What are we missing?   Tier A events nobody is booked on.
     2. What can we combine?   Events close enough in time and space that one
                               trip covers both - the marginal cost of the
                               second event is nearly zero once the flight is
                               paid for, which is the cheapest pipeline on the
                               calendar.
     3. What can we not do?    Events that overlap, so the team has to choose.

   Region codes are too coarse for question 2 - "EMEA" contains both Berlin to
   Berlin and London to Dubai. So real coordinates, and real distances.
--------------------------------------------------------------------------- */

/* Convenience only - NOT the source of truth.
 *
 * Distances come from conferences.latitude/longitude on the row itself, because
 * any hardcoded list of cities is permanently incomplete and an event in a city
 * nobody listed would silently vanish from trip clustering.
 *
 * This table exists so that typing a city we happen to know fills in its
 * country, region and coordinates automatically. Type somewhere else and you
 * supply those yourself, or the AI draft does - either way the event works.
 *
 * Rough coordinates are fine: the question is "can one trip cover both", and
 * nobody needs better than ~10km to answer it. */
export const CITIES = {
  Amsterdam:             { at: [52.37, 4.90], country: 'Netherlands', region: 'EMEA' },
  Athens:                { at: [37.98, 23.73], country: 'Greece', region: 'EMEA' },
  Atlanta:               { at: [33.75, -84.39], country: 'USA', region: 'NA' },
  Austin:                { at: [30.27, -97.74], country: 'USA', region: 'NA' },
  Bangkok:               { at: [13.76, 100.50], country: 'Thailand', region: 'APAC' },
  Barcelona:             { at: [41.39, 2.17], country: 'Spain', region: 'EMEA' },
  Berlin:                { at: [52.52, 13.40], country: 'Germany', region: 'EMEA' },
  Boston:                { at: [42.36, -71.06], country: 'USA', region: 'NA' },
  Brussels:              { at: [50.85, 4.35], country: 'Belgium', region: 'EMEA' },
  Budapest:              { at: [47.50, 19.04], country: 'Hungary', region: 'EMEA' },
  Cannes:                { at: [43.55, 7.02], country: 'France', region: 'EMEA' },
  Chicago:               { at: [41.88, -87.63], country: 'USA', region: 'NA' },
  Copenhagen:            { at: [55.68, 12.57], country: 'Denmark', region: 'EMEA' },
  Dubai:                 { at: [25.20, 55.27], country: 'UAE', region: 'EMEA' },
  Dublin:                { at: [53.35, -6.26], country: 'Ireland', region: 'EMEA' },
  Frankfurt:             { at: [50.11, 8.68], country: 'Germany', region: 'EMEA' },
  Geneva:                { at: [46.20, 6.14], country: 'Switzerland', region: 'EMEA' },
  'Fort Lauderdale':     { at: [26.12, -80.14], country: 'USA', region: 'NA' },
  Helsinki:              { at: [60.17, 24.94], country: 'Finland', region: 'EMEA' },
  'Hong Kong':           { at: [22.32, 114.17], country: 'Hong Kong', region: 'APAC' },
  Istanbul:              { at: [41.01, 28.98], country: 'Turkey', region: 'EMEA' },
  Jakarta:               { at: [-6.21, 106.85], country: 'Indonesia', region: 'APAC' },
  'Kuala Lumpur':        { at: [3.14, 101.69], country: 'Malaysia', region: 'APAC' },
  'Las Vegas':           { at: [36.17, -115.14], country: 'USA', region: 'NA' },
  Lisbon:                { at: [38.72, -9.14], country: 'Portugal', region: 'EMEA' },
  London:                { at: [51.51, -0.13], country: 'UK', region: 'EMEA' },
  'Los Angeles':         { at: [34.05, -118.24], country: 'USA', region: 'NA' },
  Madrid:                { at: [40.42, -3.70], country: 'Spain', region: 'EMEA' },
  Manchester:            { at: [53.48, -2.24], country: 'UK', region: 'EMEA' },
  'Mexico City':         { at: [19.43, -99.13], country: 'Mexico', region: 'LATAM' },
  Miami:                 { at: [25.76, -80.19], country: 'USA', region: 'NA' },
  Milan:                 { at: [45.46, 9.19], country: 'Italy', region: 'EMEA' },
  Mumbai:                { at: [19.08, 72.88], country: 'India', region: 'APAC' },
  Munich:                { at: [48.14, 11.58], country: 'Germany', region: 'EMEA' },
  'National Harbor':     { at: [38.78, -77.02], country: 'USA', region: 'NA' },
  'New Orleans':         { at: [29.95, -90.07], country: 'USA', region: 'NA' },
  'New York':            { at: [40.71, -74.01], country: 'USA', region: 'NA' },
  Nairobi:               { at: [-1.29, 36.82], country: 'Kenya', region: 'EMEA' },
  Orlando:               { at: [28.54, -81.38], country: 'USA', region: 'NA' },
  Paris:                 { at: [48.86, 2.35], country: 'France', region: 'EMEA' },
  Riyadh:                { at: [24.71, 46.68], country: 'Saudi Arabia', region: 'EMEA' },
  Rome:                  { at: [41.90, 12.50], country: 'Italy', region: 'EMEA' },
  'San Diego':           { at: [32.72, -117.16], country: 'USA', region: 'NA' },
  'San Francisco':       { at: [37.77, -122.42], country: 'USA', region: 'NA' },
  'São Paulo':           { at: [-23.55, -46.63], country: 'Brazil', region: 'LATAM' },
  Seoul:                 { at: [37.57, 126.98], country: 'South Korea', region: 'APAC' },
  Shanghai:              { at: [31.23, 121.47], country: 'China', region: 'APAC' },
  Singapore:             { at: [1.35, 103.82], country: 'Singapore', region: 'APAC' },
  Stockholm:             { at: [59.33, 18.07], country: 'Sweden', region: 'EMEA' },
  Sydney:                { at: [-33.87, 151.21], country: 'Australia', region: 'APAC' },
  'Tel Aviv':            { at: [32.08, 34.78], country: 'Israel', region: 'EMEA' },
  Tokyo:                 { at: [35.68, 139.69], country: 'Japan', region: 'APAC' },
  Toronto:               { at: [43.65, -79.38], country: 'Canada', region: 'NA' },
  Vienna:                { at: [48.21, 16.37], country: 'Austria', region: 'EMEA' },
  Warsaw:                { at: [52.23, 21.01], country: 'Poland', region: 'EMEA' },
  Washington:            { at: [38.91, -77.04], country: 'USA', region: 'NA' },
  Zurich:                { at: [47.38, 8.54], country: 'Switzerland', region: 'EMEA' },
}

export const KNOWN_CITIES = Object.keys(CITIES).sort()
export const KNOWN_COUNTRIES = [...new Set(Object.values(CITIES).map((c) => c.country))].sort()

const toRad = (d) => (d * Math.PI) / 180

/** Coordinates for one event: its own columns first, the city table as a
 *  fallback for rows predating the latitude/longitude migration. */
export function coordsOf(conference) {
  if (conference?.latitude != null && conference?.longitude != null) {
    return [Number(conference.latitude), Number(conference.longitude)]
  }
  return CITIES[conference?.city]?.at ?? null
}

export function distanceKm(confA, confB) {
  const a = coordsOf(confA)
  const b = coordsOf(confB)
  if (!a || !b) return null
  const [lat1, lon1] = a
  const [lat2, lon2] = b
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)))
}

const days = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000)

/* How far apart two events can be and still plausibly be one trip. Reported as
 * a band rather than a yes/no, because "same city" and "a two-hour flight" are
 * genuinely different propositions and the rep should see which one this is. */
function proximity(km) {
  if (km === null) return null
  if (km < 50)   return { band: 'same city',   note: 'Same city' }
  if (km < 800)  return { band: 'short hop',   note: `${km} km - short hop` }
  if (km < 2000) return { band: 'same leg',    note: `${km} km - same continental leg` }
  return null
}

/* A gap longer than this is not a trip extension - you fly home and come back.
 * Ten days is about the limit of "stay out there and do both". */
export const MAX_GAP_DAYS = 10

/* And a cap on the whole thing. Individually-plausible hops chain into
 * implausible journeys: London -> Amsterdam -> Rome -> London is three
 * reasonable legs and one absurd month away from home. */
export const MAX_TRIP_DAYS = 16

/** Can these two events plausibly sit on one trip? */
function canPair(a, b) {
  const km = distanceKm(a, b)
  const near = proximity(km)
  if (!near) return null

  const [first, second] = a.start_date <= b.start_date ? [a, b] : [b, a]
  const gap = days(first.end_date, second.start_date)

  /* Same city is the one case where overlapping dates are a FEATURE, not a
   * conflict - co-located shows like TravelTech and Business Travel Show run
   * the same days in the same venue, and that is the strongest cluster there
   * is. Everywhere else, overlapping means you have to choose. */
  if (km < 50) return gap <= MAX_GAP_DAYS ? { gap, km, near } : null
  return gap >= 0 && gap <= MAX_GAP_DAYS ? { gap, km, near } : null
}

const spanDays = (events) => {
  const starts = events.map((e) => e.start_date).sort()
  const ends = events.map((e) => e.end_date).sort()
  return days(starts[0], ends[ends.length - 1]) + 1
}

/**
 * Groups of events one trip could cover.
 *
 * Pairwise rather than a greedy walk down the calendar. The walk compared only
 * CONSECUTIVE events, so an unrelated event landing between two related ones
 * broke the pair - MRC Vegas sits between MPE Berlin and ITB Berlin in date
 * order, and hid the best cluster on the calendar.
 *
 * Groups grow only while every member is mutually pairable (a clique, not a
 * chain) and the whole trip stays under the cap.
 */
export function findClusters(conferences) {
  const sorted = [...conferences].sort((a, b) => a.start_date.localeCompare(b.start_date))

  const pairs = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const link = canPair(sorted[i], sorted[j])
      if (link) pairs.push({ events: [sorted[i], sorted[j]], ...link })
    }
  }

  // Best pairs first, so the strongest cluster claims its events.
  pairs.sort((a, b) => {
    const fitA = Math.max(...a.events.map((e) => e.fit ?? 0))
    const fitB = Math.max(...b.events.map((e) => e.fit ?? 0))
    return fitB - fitA || a.km - b.km
  })

  const used = new Set()
  const clusters = []

  for (const pair of pairs) {
    if (pair.events.some((e) => used.has(e.id))) continue
    const group = [...pair.events]

    for (const c of sorted) {
      if (group.some((g) => g.id === c.id) || used.has(c.id)) continue
      if (!group.every((g) => canPair(g, c))) continue
      if (spanDays([...group, c]) > MAX_TRIP_DAYS) continue
      group.push(c)
    }

    group.sort((a, b) => a.start_date.localeCompare(b.start_date))
    group.forEach((e) => used.add(e.id))

    const legs = group.slice(1).map((c, i) => ({
      from: group[i].city,
      to: c.city,
      km: distanceKm(group[i], c),
      gap: days(group[i].end_date, c.start_date),
    }))

    clusters.push({
      id: group.map((e) => e.id).join('+'),
      events: group,
      legs,
      totalDays: spanDays(group),
      sameCity: group.every((e) => e.city === group[0].city),
      bestFit: Math.max(...group.map((e) => e.fit ?? 0)),
    })
  }

  return clusters.sort((a, b) => a.events[0].start_date.localeCompare(b.events[0].start_date))
}

/** Events whose dates overlap - the team cannot be in both places. */
export function findConflicts(conferences) {
  const sorted = [...conferences].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const groups = []

  for (let i = 0; i < sorted.length; i++) {
    const overlapping = [sorted[i]]
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start_date > sorted[i].end_date) break
      // Only a real conflict if they are far enough apart to need separate trips.
      const km = distanceKm(sorted[i], sorted[j])
      if (km === null || km > 800) overlapping.push(sorted[j])
    }
    if (overlapping.length > 1) groups.push(overlapping)
  }

  return groups
    // Drop groups fully contained in an earlier one.
    .filter((g, i) =>
      !groups.some((other, j) =>
        j < i && g.every((e) => other.some((o) => o.id === e.id))))
    /* A clash only matters if at least two of the events were worth attending.
     * "AFP versus Web Summit" is not a dilemma - you go to AFP. Surfacing it as
     * a conflict trains the rep to ignore the conflict list. */
    .filter((g) => g.filter((e) => e.tier === 'A' || e.tier === 'B').length >= 2)
}

/** Tier A events with nobody assigned. The "where are we under-invested" answer. */
export function findGaps(conferences, coverageByConf) {
  return conferences
    .filter((c) => c.tier === 'A' && !(coverageByConf[c.id]?.length))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
}

/** Group events into calendar months for the timeline. */
export function byMonth(conferences) {
  const months = new Map()
  for (const c of [...conferences].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const key = c.start_date.slice(0, 7)
    if (!months.has(key)) months.set(key, [])
    months.get(key).push(c)
  }
  return [...months.entries()].map(([key, events]) => ({ key, events }))
}

/** How loaded each rep is, for spotting an unbalanced plan. */
export function repLoad(coverage, reps) {
  const counts = Object.fromEntries(reps.map((r) => [r.id, 0]))
  for (const row of coverage) {
    if (row.status !== 'declined' && row.rep_id in counts) counts[row.rep_id]++
  }
  return counts
}
