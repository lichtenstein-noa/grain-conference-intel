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
import { exampleDiscovery } from '../lib/examples.js'
import AddConference from './AddConference.jsx'
import RepAssign, { initials } from './RepAssign.jsx'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December']

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

    /* No key: show a saved result from a real run rather than a dead button.
     * Most people opening the live site have no key - the brief requires keys to
     * be user-supplied - and a greyed-out control tells them nothing about what
     * the feature does. Labelled as saved, never passed off as live. */
    if (!hasAnthropicKey()) {
      const example = exampleDiscovery(events)
      if (example) setFound({ ...example.result, _example: example })
      else setFindError(
`Finds conferences within ${MAX_TRIP_DAYS} days and 1,500 km of this trip and ` +
        'checks each against a real page. Needs an Anthropic API key - add one in Settings.',
      )
      return
    }

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
        <WorkloadStrip reps={reps} loads={loads} />
      </div>

      {gaps.length > 0 && (
        <section className="plan-block">
          <h3 className="plan-h">Nobody is going to these</h3>
          <p className="plan-sub">
Tier A events with nobody assigned.
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
Combines with {partner.map((e) => e.name).join(' and ')} - someone is already nearby.
                    </div>
                  )}
                </div>
                <RepAssign reps={reps} assigned={byConf[c.id] || []} onToggle={(rid) => toggle(c.id, rid)} />
              </div>
            )
          })}
        </section>
      )}

      {clusters.length > 0 && (
        <section className="plan-block">
          <h3 className="plan-h">Trips worth combining</h3>
          <p className="plan-sub">
Within {MAX_TRIP_DAYS} days, no more than {MAX_GAP_DAYS} days between stops.
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
                    disabled={finding}
                    onClick={() => findNearby(cl.events)}
                  >
                    {/* Only promise an example when one actually exists for this
                        trip, otherwise the label offers something the click
                        cannot deliver. */}
                    {finding && anchor?.[0]?.id === cl.events[0].id
                      ? 'Searching…'
                      : !hasAnthropicKey() && exampleDiscovery(cl.events)
                        ? 'What else is nearby? (example)'
                        : 'What else is nearby?'}
                  </button>
                  {/* Lit only when this rep is on EVERY event in the trip -
                      "on one leg of it" is not the same as "doing this trip". */}
                  <RepAssign
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
Overlapping dates, too far apart to combine.
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
                    <RepAssign
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
          Searching. Each candidate is checked against a real page, so this takes a while.
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
        <strong>
          {found.events.length
            ? `${found.events.length} possible addition${found.events.length === 1 ? '' : 's'}`
            : found.ruledOut?.length
              ? 'Nothing qualified'
              : 'Nothing worth adding'}
        </strong>
        <span className="discovery-meta">
          {found._spend && <span className="spend">~${found._spend.usd.toFixed(3)}</span>}
          {/* Captures a genuine run so it can be shipped as the keyless example.
              Real output pasted into examples.js beats a plausible-looking
              fixture written by hand. */}
          {!found._example && (
            <button
              className="chip"
              title="Copy this result as JSON, to save as the no-key example"
              onClick={() => {
                const { _spend, ...clean } = found
                navigator.clipboard?.writeText(JSON.stringify(clean, null, 2))
              }}
            >
              Copy JSON
            </button>
          )}
          <button className="chip" onClick={onDismiss}>Dismiss</button>
        </span>
      </div>
      {found._example && (
        <p className="example-banner">
<strong>Saved result</strong> from a real run on{' '}
          {new Date(found._example.capturedAt).toLocaleDateString()}. Add a key in Settings to
          search live.
        </p>
      )}

      <p className="settings-hint">{found.searched}</p>

      {found.events.length === 0 ? (
        found.outcome === 'search_failed' ? (
          <p className="addconf-warn">
            The search didn’t complete, so nothing was checked. Not a verdict on the trip -
            try again shortly.
          </p>
        ) : found.ruledOut?.length ? (
          /* Candidates were considered and dropped. Saying "this trip is already
             the right shape" here would be a claim we did not earn. */
          <p className="muted" style={{ fontSize: 13.5 }}>
            Each candidate was checked and none cleared the distance and date limits. Detail below.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 13.5 }}>
            Nothing close enough in time and place. This trip is already the right shape.
          </p>
        )
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
              {/* The event's own site first - that is what a rep wants to open.
                  The source is where these facts were actually read, which may
                  be a listing rather than the organiser, so it is shown too. */}
              {e.website && (
                <a href={e.website} target="_blank" rel="noreferrer">Event site ↗</a>
              )}
              {e.source_url && e.source_url !== e.website && (
                <a href={e.source_url} target="_blank" rel="noreferrer" className="faint">
                  source ↗
                </a>
              )}
              {e._km != null && (
                <span className="faint">
                  {e._km === 0 ? 'same city' : `${e._km.toLocaleString()} km`} · {e._gap} days apart
                </span>
              )}
              {e.dates_confidence !== 'high' && (
                <span className="disc-flag">dates {e.dates_confidence} confidence</span>
              )}
              <button className="chip" onClick={() => onReview(e)}>Review &amp; add</button>
            </div>
          </div>
        ))
      )}

      {/* What was considered and dropped, with the measurement that dropped it.
          "Too far away, trust me" is the kind of claim this tool should not be
          making - a rep can click through and disagree. */}
      {found.ruledOut?.length > 0 && (
        <div className="disc-ruled">
          <div className="bd-head">Checked and ruled out</div>
          <ul>
            {found.ruledOut.map((r) => (
              <li key={r.name}>
                {r.website || r.source_url ? (
                  <a href={r.website || r.source_url} target="_blank" rel="noreferrer">{r.name}</a>
                ) : (
                  <strong>{r.name}</strong>
                )}
                {r.detail && <span className="faint"> · {r.detail}</span>}
                <div className="disc-ruled-why">{r.why}</div>
              </li>
            ))}
          </ul>
        </div>
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

/* Who is carrying the year.
 *
 * Listing every rep with a count works at four people and becomes a wall at
 * twenty - and the wall hides the only two facts worth acting on: who is
 * overloaded, and who has nothing booked. So the strip shows the busiest few
 * and, separately, names anyone on zero. The rest are a count. */
function WorkloadStrip({ reps, loads }) {
  const ranked = [...reps].sort((a, b) => (loads[b.id] ?? 0) - (loads[a.id] ?? 0))
  const unused = ranked.filter((r) => !(loads[r.id] ?? 0))
  const busy = ranked.filter((r) => loads[r.id] ?? 0).slice(0, 5)
  const hidden = ranked.filter((r) => loads[r.id] ?? 0).length - busy.length

  return (
    <div className="plan-load">
      <span className="plan-load-label">Coverage load</span>
      <div className="plan-load-chips">
        {busy.map((r) => (
          <span key={r.id} className="loadchip" title={`${r.name}${r.home_city ? ` - ${r.home_city}` : ''}`}>
            <span className="avatar">{initials(r.name)}</span>
            {loads[r.id]}
          </span>
        ))}
        {hidden > 0 && <span className="loadchip faint">+{hidden} more</span>}
        {busy.length === 0 && <span className="faint">nobody assigned yet</span>}
      </div>
      {unused.length > 0 && (
        <div className="plan-load-free" title={unused.map((r) => r.name).join(', ')}>
          {unused.length === 1
            ? `${unused[0].name} has nothing booked`
            : `${unused.length} reps have nothing booked`}
        </div>
      )}
    </div>
  )
}

function Stat({ n, label, tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
    </div>
  )
}

function dateLabel(c) {
  const d = formatRange(c.start_date, c.end_date)
  return `${d.days} ${d.month}`
}
