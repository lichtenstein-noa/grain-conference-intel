import { VERDICTS } from './arc.js'
import { SIGNALS } from './signals.js'

/* ---------------------------------------------------------------------------
   Pushing leads into HubSpot.

   WHY THIS IS A FILE AND NOT AN API CALL

   HubSpot's API rejects cross-origin browser requests. There is no client-side
   workaround - a real push needs server-side code holding a private app token,
   which is the one piece of infrastructure this project deliberately does not
   have. The brief asks for "a path to push leads into HubSpot", and a file
   import is a real path: it is how most sales teams actually load a conference
   list, it needs no credentials, and it works the moment someone opens this.

   The server-side version is maybe thirty lines - one Vercel function that
   forwards to /crm/v3/objects/contacts with the user's token. It is left out
   because shipping an untested integration that looks finished is worse than
   shipping an export that demonstrably works.

   WHAT ACTUALLY GETS EXPORTED

   Not just "we met Sarah Chen" - HubSpot can get that from a badge scan. What
   this tool knows and HubSpot cannot is the READ: how many times, in what
   direction, what changed, and what to do next. That judgement is the payload
   worth sending, and it is why the integration earns its place.
--------------------------------------------------------------------------- */

const SIGNAL_LABEL = Object.fromEntries(SIGNALS.map((s) => [s.id, s.label]))

/* Our verdict mapped onto HubSpot's own Lead Status property, so the import
 * lands as something a rep can filter and work - not an inert custom field.
 * A tire-kicker arriving as "Unqualified" is the whole point: it stops someone
 * spending another year on them because the record looked warm. */
const LEAD_STATUS = {
  ready:       'Open deal',
  warming:     'In progress',
  revived:     'In progress',
  stalled:     'Open',
  dormant:     'Attempted to contact',
  tire_kicker: 'Unqualified',
  new:         'New',
}

const COLUMNS = [
  'Email',
  'First Name',
  'Last Name',
  'Company Name',
  'Job Title',
  'Lead Status',
  'Times Met',
  'Relationship Read',
  'Why',
  'Recommended Next Step',
  'First Met',
  'Last Met',
  'Conferences Attended',
  'Met By',
  'Buying Signals',
  'Field Notes',
]

/** RFC 4180: wrap everything, double any internal quote. Notes contain commas,
 *  quotes and newlines as a matter of course - a naive join corrupts the file. */
function csvCell(value) {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/** HubSpot splits on the first space; anything after it is the surname. */
function splitName(full) {
  const parts = (full || '').trim().split(/\s+/)
  return parts.length < 2
    ? { first: parts[0] || '', last: '' }
    : { first: parts[0], last: parts.slice(1).join(' ') }
}

function rowFor(contact) {
  const { arc, encounters = [] } = contact
  const { first, last } = splitName(contact.full_name)
  const ordered = [...encounters].sort((a, b) => a.met_on.localeCompare(b.met_on))

  const conferences = ordered
    .map((e) => `${e.conferences?.name ?? 'Unknown'} (${e.met_on})`)
    .join('; ')

  const reps = [...new Set(ordered.map((e) => e.reps?.name).filter(Boolean))].join(', ')

  const signals = [...new Set(ordered.flatMap((e) => e.signals || []))]
    .map((s) => SIGNAL_LABEL[s] ?? s)
    .join(', ')

  // Each note prefixed with where it was said - a note without its context is
  // just a sentence.
  const notes = ordered
    .filter((e) => e.notes)
    .map((e) => `${e.conferences?.name ?? 'Unknown'}, ${e.met_on}: ${e.notes}`)
    .join('\n')

  return [
    contact.email ?? '',
    first,
    last,
    contact.current_company ?? '',
    contact.current_title ?? '',
    LEAD_STATUS[arc?.verdict] ?? 'New',
    encounters.length,
    VERDICTS[arc?.verdict]?.label ?? '',
    (arc?.reasons ?? []).join('; '),
    arc?.nextMove ?? '',
    ordered[0]?.met_on ?? '',
    ordered[ordered.length - 1]?.met_on ?? '',
    conferences,
    reps,
    signals,
    notes,
  ]
}

export function buildCsv(contacts) {
  const lines = [COLUMNS.map(csvCell).join(',')]
  for (const c of contacts) lines.push(rowFor(c).map(csvCell).join(','))
  return lines.join('\r\n')
}

/** Trigger a download. The BOM makes Excel open UTF-8 correctly, which matters
 *  the first time a name has an accent in it. */
export function downloadCsv(contacts, filename = 'hubspot-leads.csv') {
  const blob = new Blob(['﻿' + buildCsv(contacts)], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Columns beyond HubSpot's built-ins, so the README and UI can say which ones
 *  need creating once before the first import. */
export const CUSTOM_PROPERTIES = [
  'Times Met', 'Relationship Read', 'Why', 'Recommended Next Step',
  'First Met', 'Last Met', 'Conferences Attended', 'Met By',
  'Buying Signals', 'Field Notes',
]
