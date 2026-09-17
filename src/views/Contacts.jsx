import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { analyseArc, VERDICTS } from '../lib/arc.js'
import { SIGNALS } from '../lib/signals.js'
import { formatRange } from '../lib/format.js'

const SIGNAL_LABEL = Object.fromEntries(SIGNALS.map((s) => [s.id, s.label]))

/* Verdict order for the default sort. This is the rep's working queue, so it
 * runs by what deserves attention now: closeable first, waste last. A plain
 * alphabetical list would bury the one person worth chasing this week. */
const PRIORITY = ['ready', 'dormant', 'revived', 'warming', 'stalled', 'new', 'tire_kicker']

export default function Contacts() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('repeat')
  const [openId, setOpenId] = useState(null)

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
        <span className="faint">
          {repeats} of {rows.length} met more than once
        </span>
      </div>

      <div className="filters">
        <button className="chip" aria-pressed={filter === 'repeat'} onClick={() => setFilter('repeat')}>
          Repeat contacts
        </button>
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Everyone
        </button>
        {['ready', 'dormant', 'tire_kicker'].map((v) => (
          <button key={v} className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>
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
          <span className={`verdict verdict-${v.tone}`}>{v.label}</span>
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
        <h4 className="bd-head">Why this reads as {VERDICTS[arc.verdict].label.toLowerCase()}</h4>
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
