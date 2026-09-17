import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { scoreAll } from '../lib/scoring.js'
import {
  findClusters, findConflicts, findGaps, byMonth, repLoad,
  MAX_GAP_DAYS, MAX_TRIP_DAYS,
} from '../lib/planning.js'
import { formatRange } from '../lib/format.js'
import { discoverNearTrip } from '../lib/ai.js'
import { hasAnthropicKey } from '../lib/settings.js'
import AddConference from './AddConference.jsx'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December']

const initials = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export default function Plan() {
  const [confs, setConfs] = useState(null)
  const [reps, setReps] = useState([])
  const [coverage, setCoverage] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  /* Trip discovery. Anchored to a trip that already exists rather than an
   * open-ended "find me fintech events" - the flight is already paid for, so
   * the question is what else it can cover. That framing is also what keeps the
   * model honest: a bounded question about a real place and a real week is
   * checkable, where an open one invites plausible-sounding inventions. */
  const [anchor, setAnchor] = useState(null)       // events being extended
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState(null)
  const [findError, setFindError] = useState(null)
  const [reviewing, setReviewing] = useState(null) // draft being turned into a real event

  async function findNearby(events) {
    setAnchor(events)
    setFound(null)
    setFindError(null)
    setFinding(true)
    try {
      const result = await discoverNearTrip({
        events,
        existingNames: (confs || []).map((c) => c.name),
      })
      setFound(result)
    } catch (err) {
      setFindError(err.message)
    } finally {
      setFinding(false)
    }
  }

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const [c, r, v] = await Promise.all([
      supabase.from('conferences').select('*').gte('end_date', today),
      supabase.from('reps').select('*').order('name'),
      supabase.from('coverage').select('*'),
    ])
    if (c.error || r.error || v.error) return setError((c.error || r.error || v.error).message)
    setConfs(scoreAll(c.data))
    setReps(r.data)
    setCoverage(v.data)
  }, [])

  useEffect(() => { load() }, [load])

  const byConf = useMemo(() => {
    const m = {}
    for (const row of coverage) (m[row.conference_id] ??= []).push(row)
    return m
  }, [coverage])

  const analysis = useMemo(() => {
    if (!confs) return null
    return {
      clusters: findClusters(confs),
      conflicts: findConflicts(confs),
      gaps: findGaps(confs, byConf),
      months: byMonth(confs),
      load: repLoad(coverage, reps),
    }
  }, [confs, byConf, coverage, reps])

  /* Optimistic toggle: the rep taps, the chip changes immediately, the write
   * follows. A planning screen where each click waits on a round trip feels
   * broken even when it is working. */
  async function toggle(conferenceId, repId) {
    const key = `${conferenceId}:${repId}`
    if (busy) return
    setBusy(key)
    const existing = coverage.find((r) => r.conference_id === conferenceId && r.rep_id === repId)

    if (existing) {
      setCoverage((rows) => rows.filter((r) => r.id !== existing.id))
      await supabase.from('coverage').delete().eq('id', existing.id)
    } else {
      const optimistic = { id: key, conference_id: conferenceId, rep_id: repId, status: 'planned' }
      setCoverage((rows) => [...rows, optimistic])
      const { data } = await supabase
        .from('coverage')
        .insert({ conference_id: conferenceId, rep_id: repId, status: 'planned' })
        .select()
      if (data?.[0]) {
        setCoverage((rows) => rows.map((r) => (r.id === key ? data[0] : r)))
      }
    }
    setBusy(null)
  }

  if (error) return <p className="notice"><strong>Could not load the plan.</strong> {error}</p>
  if (!analysis) return <p className="muted">Loading…</p>

  const { clusters, conflicts, gaps, months, load: loads } = analysis

  return (
    <>
      <div className="section-head">
        <h2>Plan</h2>
        <span className="faint">{confs.length} upcoming events</span>
      </div>

      {/* A discovered event goes through exactly the same form as a hand-typed
          one - same fields, same score preview, same unticked dates checkbox.
          The AI fills it in; it does not get a shortcut past the review. */}
      {reviewing && (
        <AddConference
          seed={{
            ...reviewing,
            latitude: String(reviewing.latitude ?? ''),
            longitude: String(reviewing.longitude ?? ''),
            est_attendance: String(reviewing.est_attendance ?? ''),
            verified: false,
          }}
          onCancel={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); setFound(null); setAnchor(null); load() }}
        />
      )}

      <div className="plan-stats">
        <Stat n={gaps.length} label={gaps.length === 1 ? 'Tier A uncovered' : 'Tier A uncovered'} tone={gaps.length ? 'bad' : 'good'} />
        <Stat n={clusters.length} label="trips that combine" tone="good" />
        <Stat n={conflicts.length} label="date clashes" tone={conflicts.length ? 'warn' : 'good'} />
        <div className="plan-load">
          {reps.map((r) => (
            <span key={r.id} className="loadchip" title={`${r.name} — ${r.home_city}`}>
              <span className="avatar">{initials(r.name)}</span>
              {loads[r.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      {gaps.length > 0 && (
        <section className="plan-block">
          <h3 className="plan-h">Nobody is going to these</h3>
          <p className="plan-sub">
            Tier A events with no rep assigned — the clearest under-investment on the calendar.
          </p>
          {gaps.map((c) => {
            /* An uncovered event can legitimately also appear under trips, and
             * seeing it twice is confusing unless the two say different things.
             * So say the useful thing: this one is cheap to fix, because
             * somebody may already be flying that way. */
            const trip = clusters.find((cl) => cl.events.some((e) => e.id === c.id))
            const partner = trip?.events.filter((e) => e.id !== c.id)

            return (
              <div key={c.id} className="plan-card is-gap">
                <div>
                  <strong>{c.name}</strong>
                  <span className="faint"> · {c.city} · {dateLabel(c)} · fit {c.fit}</span>
                  {partner?.length > 0 && (
                    <div className="gap-hint">
                      Combines with {partner.map((e) => e.name).join(' and ')} — whoever covers
                      that is already nearby.
                    </div>
                  )}
                </div>
                <RepPicker reps={reps} assigned={byConf[c.id] || []} onToggle={(rid) => toggle(c.id, rid)} />
              </div>
            )
          })}
        </section>
      )}

      {clusters.length > 0 && (
        <section className="plan-block">
          <h3 className="plan-h">Trips worth combining</h3>
          <p className="plan-sub">
            Events close enough in time and distance that one journey covers them all — up to{' '}
            {MAX_TRIP_DAYS} days away, with no more than {MAX_GAP_DAYS} days between stops. Once
            the flight is paid for, each extra event costs almost nothing.
          </p>
          {clusters.map((cl) => (
            <div key={cl.id} className="plan-card is-cluster">
              {/* Coverage is shown PER EVENT, not once for the trip.
                  Rolling it up hid the case that matters: one rep booked on the
                  first event and nobody on the second still looked fully
                  covered, while the gaps list correctly said otherwise. Two
                  sections of the same screen disagreeing is worse than either
                  being wrong on its own. */}
              <div className="cluster-events">
                {cl.events.map((e, i) => {
                  const on = byConf[e.id] || []
                  return (
                    <div key={e.id}>
                      {i > 0 && <LegLabel leg={cl.legs[i - 1]} />}
                      <div className="cluster-event">
                        <span className="cluster-event-name">
                          <strong>{e.name}</strong>
                          <span className="faint"> · {e.city} · {dateLabel(e)}</span>
                        </span>
                        <span className="cluster-event-cov">
                          {on.length === 0 ? (
                            <span className="nobody">nobody yet</span>
                          ) : (
                            on.map((row) => {
                              const rep = reps.find((r) => r.id === row.rep_id)
                              return rep ? (
                                <span key={row.id} className="avatar" title={rep.name}>
                                  {initials(rep.name)}
                                </span>
                              ) : null
                            })
                          )}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="cluster-foot">
                <span className="faint">
                  {cl.events.length} events · {cl.totalDays} days away · best fit {cl.bestFit}
                </span>
                <div className="cluster-actions">
                  <button
                    className="chip"
                    disabled={finding || !hasAnthropicKey()}
                    onClick={() => findNearby(cl.events)}
                    title={hasAnthropicKey() ? undefined : 'Add an Anthropic API key in Settings'}
                  >
                    {finding && anchor?.[0]?.id === cl.events[0].id ? 'Searching…' : 'What else is nearby?'}
                  </button>
                  {/* Lit only when this rep is on EVERY event in the trip -
                      "on one leg of it" is not the same as "doing this trip". */}
                  <RepPicker
                    reps={reps}
                    assigned={reps
                      .filter((r) => cl.events.every((e) =>
                        (byConf[e.id] || []).some((row) => row.rep_id === r.id)))
                      .map((r) => ({ rep_id: r.id }))}
                    onToggle={(rid) => cl.events.forEach((e) => toggle(e.id, rid))}
                    label="Assign to every event on this trip"
                  />
                </div>
              </div>

              {anchor?.[0]?.id === cl.events[0].id && (finding || found || findError) && (
                <Discovery
                  finding={finding}
                  found={found}
                  error={findError}
                  onDismiss={() => { setAnchor(null); setFound(null); setFindError(null) }}
                  onReview={setReviewing}
                />
              )}
            </div>
          ))}
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="plan-block">
          <h3 className="plan-h">Same week, different continents</h3>
          <p className="plan-sub">
            Worth attending, impossible to combine — these need two people or a decision.
          </p>
          {conflicts.map((g, i) => (
            <div key={i} className="plan-card is-conflict">
              {g.map((e) => (
                <div key={e.id} className="conflict-row">
                  <span className={`tier tier-${e.tier}`}>{e.tier}</span>
                  <strong>{e.name}</strong>
                  <span className="faint">{e.city} · {dateLabel(e)}</span>
                  <span className="conflict-cov">
                    {(byConf[e.id] || []).map((row) => {
                      const rep = reps.find((r) => r.id === row.rep_id)
                      return rep ? <span key={row.id} className="avatar">{initials(rep.name)}</span> : null
                    })}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="plan-block">
        <h3 className="plan-h">The year</h3>
        <p className="plan-sub">Tap a rep to assign or unassign them.</p>
        {months.map(({ key, events }) => {
          const [y, m] = key.split('-')
          return (
            <div key={key} className="month">
              <div className="month-label">
                {MONTH_NAMES[Number(m) - 1]} <span className="faint">{y}</span>
              </div>
              <div className="month-events">
                {events.map((c) => (
                  <div key={c.id} className={`month-row tierline-${c.tier}`}>
                    <span className={`tier tier-${c.tier}`}>{c.tier}</span>
                    <span className="month-name">
                      <strong>{c.name}</strong>
                      <span className="faint"> · {c.city} · {dateLabel(c)}</span>
                    </span>
                    <RepPicker
                      reps={reps}
                      assigned={byConf[c.id] || []}
                      onToggle={(rid) => toggle(c.id, rid)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}

/* Suggestions, explicitly not additions.
 *
 * Each result carries the page it was read from, so a rep can check in one
 * click rather than trusting. Nothing enters the calendar without someone
 * opening the full form and pressing Add - the model proposes, the human
 * disposes. An empty result is shown plainly rather than padded, because a
 * discovery tool that always finds something is one you stop believing. */
function Discovery({ finding, found, error, onDismiss, onReview }) {
  if (finding) {
    return (
      <div className="discovery">
        <p className="muted">
          Searching the web for events near this trip. This can take a while — it checks each
          candidate against a real page before suggesting it.
        </p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="discovery">
        <p className="addconf-warn">{error}</p>
        <button className="chip" onClick={onDismiss}>Dismiss</button>
      </div>
    )
  }
  if (!found) return null

  return (
    <div className="discovery">
      <div className="discovery-head">
        <strong>{found.events.length ? `${found.events.length} possible additions` : 'Nothing worth adding'}</strong>
        <span className="discovery-meta">
          {found._spend && <span className="spend">~${found._spend.usd.toFixed(3)}</span>}
          <button className="chip" onClick={onDismiss}>Dismiss</button>
        </span>
      </div>
      <p className="settings-hint">{found.searched}</p>

      {found.events.length === 0 ? (
        <p className="muted" style={{ fontSize: 13.5 }}>
          No other relevant events found close enough in time and place. That’s a real answer —
          this trip is already the right shape.
        </p>
      ) : (
        found.events.map((e) => (
          <div key={`${e.name}-${e.start_date}`} className="disc-card">
            <div className="disc-main">
              <strong>{e.name}</strong>
              <span className="faint">
                {' · '}{e.city}, {e.country}{' · '}{e.start_date} → {e.end_date}
                {' · '}~{e.est_attendance.toLocaleString()} attending
              </span>
            </div>
            {e.notes && <p className="disc-notes">{e.notes}</p>}
            <div className="disc-foot">
              {e.source_url && (
                <a href={e.source_url} target="_blank" rel="noreferrer">
                  Check the source ↗
                </a>
              )}
              {e.dates_confidence !== 'high' && (
                <span className="disc-flag">dates {e.dates_confidence} confidence</span>
              )}
              <button className="chip" onClick={() => onReview(e)}>Review &amp; add</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function LegLabel({ leg }) {
  if (!leg) return null
  const text = leg.km === 0
    ? (leg.gap < 0 ? 'co-located, same days' : `same city, ${leg.gap} days later`)
    : `${leg.km} km, ${leg.gap} days later`
  return <span className="leg">↳ {text} ↳</span>
}

function Stat({ n, label, tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
    </div>
  )
}

function RepPicker({ reps, assigned, onToggle, label }) {
  const ids = new Set(assigned.map((a) => a.rep_id))
  return (
    <div className="reppick" title={label}>
      {reps.map((r) => (
        <button
          key={r.id}
          className="avatar avatar-btn"
          aria-pressed={ids.has(r.id)}
          onClick={() => onToggle(r.id)}
          title={`${r.name} — ${r.home_city}`}
        >
          {initials(r.name)}
        </button>
      ))}
    </div>
  )
}

function dateLabel(c) {
  const d = formatRange(c.start_date, c.end_date)
  return `${d.days} ${d.month}`
}
