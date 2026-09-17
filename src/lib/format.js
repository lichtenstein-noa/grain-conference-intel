const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse a 'YYYY-MM-DD' date column as a LOCAL date.
 *  new Date('2027-03-09') parses as UTC and can render as the 8th in western
 *  timezones - which would quietly shift conference dates by a day. */
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "9–11 Mar" / "30 Nov – 3 Dec" - compact enough for a dense row. */
export function formatRange(startIso, endIso) {
  const s = parseDate(startIso)
  const e = parseDate(endIso)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  return sameMonth
    ? { month: MONTHS[s.getMonth()], days: `${s.getDate()}–${e.getDate()}`, year: s.getFullYear() }
    : {
        month: `${MONTHS[s.getMonth()]}–${MONTHS[e.getMonth()]}`,
        days: `${s.getDate()} – ${e.getDate()}`,
        year: s.getFullYear(),
      }
}

export function formatAttendance(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Whole days from today until the event starts. Negative once it has begun. */
export function daysUntil(iso) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseDate(iso) - today) / 86400000)
}
