import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { analyseArc, VERDICTS } from '../lib/arc.js'
import { SIGNALS } from '../lib/signals.js'
import { formatRange } from '../lib/format.js'
import { downloadCsv, CUSTOM_PROPERTIES } from '../lib/hubspot.js'

const SIGNAL_LABEL = Object.fromEntries(SIGNALS.map((s) => [s.id, s.label]))

/* Verdict order for the default sort. This is the rep's working queue, so it
 * runs by what deserves attention now: closeable first, waste last. A plain
 * alphabetical list would bury the one person worth chasing this week. */
const PRIORITY = ['ready', 'dormant', 'revived', 'warming', 'stalled', 'new', 'tire_kicker']

export default function Contacts() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: contacts, error: cErr }, { data: encounters, error: eErr }] =
        await Promise.all([
          supabase.from('contacts').select('*'),
          supabase
            .from('encounters')
            .select('*, conferences(name, city, start_date, end_date), reps(name)')
            .order('met_on'),
        ])
      if (cErr || eErr) return setError((cErr || eErr).message)

      const byContact = new Map()
      for (const e of encounters) {
        if (!byContact.has(e.contact_id)) byContact.set(e.contact_id, [])
        byContact.get(e.contact_id).push(e)
      }

      setRows(
        contacts
          // Leftover fixture from the RLS verification; deletes are blocked by
          // policy so it is filtered here rather than removed.
          .filter((c) => c.full_name !== 'RLS TEST')
          .map((c) => {
            const encs = byContact.get(c.id) || []
            return { ...c, encounters: encs, arc: analyseArc(encs) }
          })
          .filter((c) => c.arc),
      )
    }
    load()
  }, [])

  const visible = useMemo(() => {
    if (!rows) return []
    return rows
      .filter((c) => {
        if (filter === 'repeat') return c.encounters.length > 1
        if (filter === 'all') return true
        return c.arc.verdict === filter
      })
      .sort((a, b) => {
        const p = PRIORITY.indexOf(a.arc.verdict) - PRIORITY.indexOf(b.arc.verdict)
        return p !== 0 ? p : b.encounters.length - a.encounters.length
      })
  }, [rows, filter])

  if (error) return <p className="notice"><strong>Could not load contacts.</strong> {error}</p>
  if (!rows) return <p className="muted">Loading…</p>

  const repeats = rows.filter((c) => c.encounters.length > 1).length

  return (
    <>
      <div className="section-head">
        <h2>Contacts</h2>
        <div className="head-right">
          <span className="faint">
            {repeats} of {rows.length} met more than once
          </span>
          {/* Exports whatever is currently filtered, so "show me everyone ready
              to close, send those to HubSpot" is one flow rather than an
              all-or-nothing dump. */}
          <button
            className="btn-primary"
            disabled={visible.length === 0}
            onClick={() => setExporting(true)}
          >
            Send to HubSpot
          </button>
        </div>
      </div>

      {exporting && (
        <HubspotExport
          contacts={visible}
          filterLabel={filter === 'repeat' ? 'repeat contacts'
            : filter === 'all' ? 'all contacts'
            : VERDICTS[filter].label.toLowerCase()}
          onClose={() => setExporting(false)}
        />
      )}

      <div className="filters">
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Everyone
        </button>
        <button className="chip" aria-pressed={filter === 'repeat'} onClick={() => setFilter('repeat')}>
          Met more than once
        </button>
        {['ready', 'dormant', 'tire_kicker'].map((v) => (
          <button
            key={v}
            className="chip"
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
            title={VERDICTS[v].meaning}
          >
            {VERDICTS[v].label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="notice">Nobody here yet. Capture a few people and they will appear.</p>
      ) : (
        <div className="conf-list">
          {visible.map((c) => (
            <ContactRow
              key={c.id}
              c={c}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

/* The push into HubSpot.
 *
 * A file rather than an API call, and the panel says why rather than hiding it:
 * HubSpot blocks browser requests, so a live push needs server-side code holding
 * a token. Naming the constraint is more useful than a button that silently
 * does something different from what its label implies. */
function HubspotExport({ contacts, filterLabel, onClose }) {
  const withEmail = contacts.filter((c) => c.email).length
  const readable = contacts.filter((c) => c.encounters.length > 1).length

  return (
    <div className="settings" style={{ marginBottom: 18 }}>
      <div className="settings-head">
        <h3>Send {contacts.length} contacts to HubSpot</h3>
        <button className="match-cancel" onClick={onClose}>Close</button>
      </div>

      <p className="plan-sub">
<strong>{filterLabel}</strong> · {withEmail} with an email to match on · {readable} with
        a relationship read.
      </p>

      <div className="hs-payload">
        <div className="bd-head">What goes with each contact</div>
        <p className="settings-hint">
          Meeting history, relationship read and next step. <strong>Lead Status</strong> is
          set from the verdict, so someone not buying arrives as <em>Unqualified</em> and
          someone ready arrives as <em>Open deal</em>.
        </p>
      </div>

      <div className="addconf-actions">
        <button
          className="cap-save"
          onClick={() => {
            downloadCsv(contacts, `hubspot-leads-${new Date().toISOString().slice(0, 10)}.csv`)
            onClose()
          }}
        >
          Download HubSpot import file
        </button>
      </div>

      <p className="settings-note">
        In HubSpot: <strong>Contacts → Import → File from computer</strong>. Email, name,
        company, job title and Lead Status map to built-in properties. These need creating
        once as custom contact properties:{' '}
        {CUSTOM_PROPERTIES.map((p, i) => (
          <span key={p}>{i > 0 && ', '}<code>{p}</code></span>
        ))}.
      </p>
    </div>
  )
}

function ContactRow({ c, open, onToggle }) {
  const { arc } = c
  const v = VERDICTS[arc.verdict]

  return (
    <article className={`conf-row${open ? ' is-open' : ''}`}>
      <button className="contact-main" onClick={onToggle} aria-expanded={open}>
        <div>
          <h3 className="conf-name">{c.full_name}</h3>
          <div className="conf-meta">
            <span>{c.current_title}</span>
            <span className="dot">·</span>
            <span>{c.current_company}</span>
          </div>
        </div>
        <div className="contact-right">
          <span className="meets">
            {c.encounters.length}× <span className="faint">met</span>
          </span>
          <span className={`verdict verdict-${v.tone}`} title={v.meaning}>{v.label}</span>
        </div>
      </button>

      {open && <Arc c={c} />}
    </article>
  )
}

function Arc({ c }) {
  const { arc } = c

  return (
    <div className="breakdown">
      <div className="arc-why">
        <h4 className="bd-head">
          {VERDICTS[arc.verdict].label}
          <span className="faint"> - {VERDICTS[arc.verdict].meaning}</span>
        </h4>
        <ul className="arc-reasons">
          {arc.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="arc-next"><strong>Next move.</strong> {arc.nextMove}</p>
      </div>

      <h4 className="bd-head">The history</h4>
      <ol className="timeline">
        {c.encounters.map((e, i) => {
          const prev = c.encounters[i - 1]
          const movedCompany = prev && prev.company_at_time !== e.company_at_time
          const movedTitle = prev && prev.title_at_time !== e.title_at_time
          const d = e.conferences
            ? formatRange(e.conferences.start_date, e.conferences.end_date)
            : null

          return (
            <li key={e.id} className="tl-item">
              <span className={`tl-dot dot-${e.temperature}`} aria-hidden="true" />
              <div className="tl-body">
                <div className="tl-head">
                  <strong>{e.conferences?.name ?? 'Unknown event'}</strong>
                  <span className="faint">
                    {d ? ` · ${d.month} ${d.year}` : ''}
                    {e.conferences?.city ? ` · ${e.conferences.city}` : ''}
                    {e.reps?.name ? ` · ${e.reps.name}` : ''}
                  </span>
                </div>

                <div className="tl-role">
                  {e.title_at_time}{e.company_at_time ? `, ${e.company_at_time}` : ''}
                  {movedTitle && !movedCompany && <span className="tl-change">promoted</span>}
                  {movedCompany && <span className="tl-change">new employer</span>}
                </div>

                {e.signals?.length > 0 && (
                  <div className="tl-signals">
                    {e.signals.map((s) => (
                      <span key={s} className={`tl-sig${s === 'just_browsing' ? ' is-neg' : ''}`}>
                        {SIGNAL_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                )}

                {e.notes && <p className="tl-notes">{e.notes}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
