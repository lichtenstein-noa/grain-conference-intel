import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formatRange, formatAttendance, daysUntil } from '../lib/format.js'
import {
  scoreAll, SEGMENT_LABELS, SEGMENT_WEIGHTS, TIER_CUTOFFS,
} from '../lib/scoring.js'
import AddConference from './AddConference.jsx'

/* `fn` always sorts ascending; direction is applied on top. Sort order never
 * changes on its own - an earlier version quietly flipped Past to newest-first,
 * which is a defensible default and still reads as a bug when nothing on screen
 * says it happened. Each sort has a sensible starting direction and an arrow
 * showing which way it currently runs. */
const SORTS = {
  date:       { label: 'Date',       defaultDir: 'asc',  fn: (a, b) => a.start_date.localeCompare(b.start_date) },
  fit:        { label: 'ICP fit',    defaultDir: 'desc', fn: (a, b) => a.fit - b.fit },
  efficiency: { label: 'Value/cost', defaultDir: 'desc', fn: (a, b) => a.efficiency - b.efficiency },
}

export default function Conferences() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  const [q, setQ] = useState('')
  const [region, setRegion] = useState('all')
  const [vertical, setVertical] = useState('all')
  const [tier, setTier] = useState('all')
  const [sort, setSort] = useState('date')
  const [dir, setDir] = useState(SORTS.date.defaultDir)
  const [openId, setOpenId] = useState(null)

  /* Past editions live in the database so encounters have somewhere to point,
   * but they are noise in a view whose only job is deciding where to go next.
   *
   * An additive "show past" toggle interleaved old and upcoming events in one
   * undifferentiated list, which read as a bug. Three explicit states instead -
   * you are either planning, looking back, or deliberately doing both. */
  const [when, setWhen] = useState('upcoming')

  const load = useCallback(() => {
    supabase
      .from('conferences')
      .select('*')
      .then(({ data, error }) => (error ? setError(error.message) : setRows(scoreAll(data))))
  }, [])

  useEffect(() => { load() }, [load])

  const facets = useMemo(() => {
    if (!rows) return { regions: [], verticals: [] }
    return {
      regions: [...new Set(rows.map((r) => r.region))].sort(),
      verticals: [...new Set(rows.map((r) => r.vertical))].sort(),
    }
  }, [rows])

  const visible = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    const today = new Date().toISOString().slice(0, 10)
    return rows
      .filter((r) => {
        const isPast = r.end_date < today
        if (when === 'upcoming' && isPast) return false
        if (when === 'past' && !isPast) return false
        if (region !== 'all' && r.region !== region) return false
        if (vertical !== 'all' && r.vertical !== vertical) return false
        if (tier !== 'all' && r.tier !== tier) return false
        if (!needle) return true
        return `${r.name} ${r.city} ${r.country}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => (dir === 'asc' ? 1 : -1) * SORTS[sort].fn(a, b))
  }, [rows, q, region, vertical, tier, sort, dir, when])

  /* Clicking the active sort flips it; clicking a different one adopts that
   * sort's natural direction. */
  const pickSort = (key) => {
    if (key === sort) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(SORTS[key].defaultDir) }
  }

  if (error) {
    return <p className="notice"><strong>Could not load conferences.</strong> {error}</p>
  }
  if (!rows) return <p className="muted">Loading…</p>

  const tierCounts = visible.reduce((a, r) => ({ ...a, [r.tier]: (a[r.tier] || 0) + 1 }), {})

  return (
    <>
      <div className="section-head">
        <h2>Conferences</h2>
        <div className="head-right">
          <span className="faint">
            {visible.length} {when === 'past' ? 'past editions' : 'events'}
            {when !== 'past' && ` · ${tierCounts.A || 0} Tier A`}
          </span>
          <button className="btn-primary" onClick={() => setAdding(!adding)}>
            {adding ? 'Close' : '+ Add event'}
          </button>
        </div>
      </div>

      {adding && (
        <AddConference
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}

      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Search name or city…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={region} onChange={setRegion} allLabel="All regions" options={facets.regions} />
        <Select value={vertical} onChange={setVertical} allLabel="All verticals" options={facets.verticals} />
        <Select value={tier} onChange={setTier} allLabel="All tiers" options={['A', 'B', 'C']} render={(t) => `Tier ${t}`} />
        <div className="segmented" role="group" aria-label="Time range">
          {[
            ['upcoming', 'Upcoming'],
            ['past', 'Past'],
            ['all', 'All'],
          ].map(([id, label]) => (
            <button
              key={id}
              className="seg"
              aria-pressed={when === id}
              onClick={() => setWhen(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sortgroup">
          <span className="faint">Sort</span>
          {Object.entries(SORTS).map(([key, s]) => (
            <button
              key={key}
              className="chip"
              aria-pressed={sort === key}
              onClick={() => pickSort(key)}
              title={sort === key ? 'Click to reverse' : undefined}
            >
              {s.label}
              {sort === key && <span className="sortdir">{dir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="notice">No conferences match those filters.</p>
      ) : (
        <div className="conf-list">
          {visible.map((c) => (
            <ConferenceRow
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

function Select({ value, onChange, options, allLabel, render = (o) => o }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>{render(o)}</option>
      ))}
    </select>
  )
}

function ConferenceRow({ c, open, onToggle }) {
  const d = formatRange(c.start_date, c.end_date)
  const until = daysUntil(c.start_date)
  const isPast = c.end_date < new Date().toISOString().slice(0, 10)

  return (
    <article className={`conf-row${open ? ' is-open' : ''}${isPast ? ' is-past' : ''}`}>
      <button className="conf-main" onClick={onToggle} aria-expanded={open}>
        <div className="conf-date">
          <div className="d-month">{d.month}</div>
          <div className="d-days">{d.days}</div>
          <div className="d-year">{d.year}</div>
        </div>

        <div className="conf-body">
          <h3 className="conf-name">{c.name}</h3>
          <div className="conf-meta">
            <span>{c.city}, {c.country}</span>
            <span className="dot">·</span>
            <span>{formatAttendance(c.est_attendance)} attending</span>
            <span className="dot">·</span>
            <span className="pill">{c.vertical}</span>
            {isPast ? (
              <span className="pill">past edition</span>
            ) : until >= 0 && until <= 60 ? (
              <span className="pill pill-soon">in {until} days</span>
            ) : null}
          </div>
        </div>

        <div className="conf-score">
          <span className={`tier tier-${c.tier}`}>{c.tier}</span>
          <span className="fit" title="ICP fit score out of 100">{c.fit}</span>
        </div>
      </button>

      {open && <Breakdown c={c} />}
    </article>
  )
}

function Breakdown({ c }) {
  return (
    <div className="breakdown">
      <div className="bd-grid">
        <section>
          <h4 className="bd-head">
            Why {c.fit}? <span className="faint">Tier {c.tier} needs {TIER_CUTOFFS.A}+</span>
          </h4>
          <table className="bd-table">
            <tbody>
              {c.components.map((comp) => (
                <tr key={comp.key}>
                  <td className="bd-label">{comp.label}</td>
                  <td className="bd-bar">
                    <span style={{ width: `${comp.normalised * 100}%` }} />
                  </td>
                  <td className="bd-weight faint">×{comp.weight.toFixed(2)}</td>
                  <td className="bd-points">{Math.round(comp.contribution * 100)}</td>
                </tr>
              ))}
              <tr className="bd-total">
                <td colSpan={3}>ICP fit</td>
                <td className="bd-points">{c.fit}</td>
              </tr>
            </tbody>
          </table>

          <p className="bd-note">
            Cost tier {c.cost_tier}/5 · value per unit cost <strong>{c.efficiency}</strong>
          </p>
        </section>

        <section>
          <h4 className="bd-head">Who is in the room</h4>
          <table className="bd-table">
            <tbody>
              {Object.keys(SEGMENT_WEIGHTS).map((col) => (
                <tr key={col} className={col === c.leadSegment ? 'is-lead' : undefined}>
                  <td className="bd-label">{SEGMENT_LABELS[col]}</td>
                  <td className="bd-bar">
                    <span style={{ width: `${(c[col] / 5) * 100}%` }} />
                  </td>
                  <td className="bd-points">{c[col]}<span className="faint">/5</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {c.notes && <p className="bd-note">{c.notes}</p>}

          {c.website && (
            <p className="bd-note">
              <a href={c.website} target="_blank" rel="noreferrer">Event site ↗</a>
              <span className="faint"> · dates {c.date_status}</span>
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
