import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getRepId, setRepId } from '../lib/session.js'
import { SIGNALS, TEMPERATURES } from '../lib/signals.js'
import { saveEncounter, checkMatches } from '../lib/capture.js'
import { formatRange } from '../lib/format.js'

const todayIso = () => new Date().toISOString().slice(0, 10)

const BLANK = {
  fullName: '', company: '', title: '',
  temperature: 'warm', signals: [], notes: '',
}

export default function Capture() {
  const [reps, setReps] = useState([])
  const [repId, setRep] = useState(getRepId())
  const [confs, setConfs] = useState(null)
  const [confId, setConfId] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [recent, setRecent] = useState([])
  const [flash, setFlash] = useState(null)
  const [ask, setAsk] = useState(null)   // pending "is this the same person?"

  const nameRef = useRef(null)

  useEffect(() => {
    supabase.from('reps').select('*').order('name').then(({ data }) => setReps(data || []))
    supabase.from('conferences').select('*').order('start_date').then(({ data }) => {
      setConfs(data || [])
      setConfId(pickCurrentConference(data || []))
    })
  }, [])

  const conference = useMemo(
    () => confs?.find((c) => c.id === confId) || null,
    [confs, confId],
  )

  // Today's captures at this event: reassurance that taps are landing, and a
  // running tally the rep can quote to their manager without opening a laptop.
  useEffect(() => {
    if (!confId || !repId) return
    supabase
      .from('encounters')
      .select('id, temperature, created_at, contacts(full_name, current_company)')
      .eq('conference_id', confId)
      .eq('rep_id', repId)
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => setRecent(data || []))
  }, [confId, repId, flash])

  if (!repId) {
    return <RepPicker reps={reps} onPick={(id) => { setRepId(id); setRep(id) }} />
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const toggleSignal = (id) =>
    set({
      signals: form.signals.includes(id)
        ? form.signals.filter((s) => s !== id)
        : [...form.signals, id],
    })

  /* Commit. `decision` carries the rep's answer when the matcher had to ask:
   * either the contact id they confirmed, or an explicit "this is someone new". */
  async function commit(decision = {}) {
    setSaving(true)
    setError(null)
    try {
      const result = await saveEncounter({
        ...form, conferenceId: confId, repId, ...decision,
      })
      setFlash(result)
      setAsk(null)
      setForm(BLANK)
      nameRef.current?.focus()   // straight back to a blank field for the next person
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onSave(e) {
    e.preventDefault()
    if (!form.fullName.trim() || saving) return

    /* Resolve identity BEFORE writing anything. Asking after the fact would mean
     * merging records later, which is the expensive kind of fix - and the rep is
     * standing right there now, so one tap settles it. */
    setSaving(true)
    const { candidates } = await checkMatches(form)
    setSaving(false)

    if (candidates.length) setAsk(candidates)
    else commit()
  }

  return (
    <div className="capture">
      <ConferenceBar
        conference={conference}
        confs={confs}
        onChange={setConfId}
        rep={reps.find((r) => r.id === repId)}
        onSwitchRep={() => setRep(null)}
      />

      {flash && <Flash result={flash} onDismiss={() => setFlash(null)} />}

      {ask && (
        <MatchPrompt
          typed={form}
          candidates={ask}
          saving={saving}
          onSame={(id) => commit({ linkContactId: id })}
          onNew={() => commit({ forceNew: true })}
          onCancel={() => setAsk(null)}
        />
      )}

      <form className="cap-form" onSubmit={onSave}>
        <input
          ref={nameRef}
          className="cap-name"
          placeholder="Name"
          value={form.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
        />

        <div className="cap-pair">
          <input
            className="cap-input"
            placeholder="Company"
            value={form.company}
            onChange={(e) => set({ company: e.target.value })}
            autoComplete="off"
            autoCapitalize="words"
          />
          <input
            className="cap-input"
            placeholder="Title"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            autoComplete="off"
            autoCapitalize="words"
          />
        </div>

        <div className="cap-temps" role="group" aria-label="How warm">
          {TEMPERATURES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cap-temp cap-temp-${t.id}`}
              aria-pressed={form.temperature === t.id}
              onClick={() => set({ temperature: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="cap-signals">
          {SIGNALS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={form.signals.includes(s.id)}
              onClick={() => toggleSignal(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <textarea
          className="cap-notes"
          rows={2}
          placeholder="Anything they said — tap the mic on your keyboard and just talk"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />

        {error && <p className="cap-error">{error}</p>}

        <button className="cap-save" type="submit" disabled={!form.fullName.trim() || saving}>
          {saving ? 'Saving…' : 'Save & next'}
        </button>
      </form>

      {recent.length > 0 && (
        <section className="cap-recent">
          <h3 className="bd-head">Captured here today · {recent.length}</h3>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <span className={`dotmark dot-${r.temperature}`} aria-hidden="true" />
                <strong>{r.contacts?.full_name}</strong>
                {r.contacts?.current_company && (
                  <span className="muted"> · {r.contacts.current_company}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** The event happening right now, else the next one starting. A rep on a show
 *  floor should never have to tell the app where they are. */
function pickCurrentConference(list) {
  const today = todayIso()
  const live = list.find((c) => c.start_date <= today && c.end_date >= today)
  if (live) return live.id
  const next = list.find((c) => c.start_date >= today)
  return (next || list[list.length - 1])?.id ?? null
}

function ConferenceBar({ conference, confs, onChange, rep, onSwitchRep }) {
  const [picking, setPicking] = useState(false)
  if (!conference) return null

  const today = todayIso()
  const isLive = conference.start_date <= today && conference.end_date >= today
  const d = formatRange(conference.start_date, conference.end_date)

  return (
    <div className="cap-bar">
      <div>
        <div className="cap-bar-label">
          {isLive ? <span className="live">● Live now</span> : 'Capturing for'}
        </div>
        {picking ? (
          <select
            className="select"
            value={conference.id}
            autoFocus
            onChange={(e) => { onChange(e.target.value); setPicking(false) }}
            onBlur={() => setPicking(false)}
          >
            {confs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city}
              </option>
            ))}
          </select>
        ) : (
          <button className="cap-bar-conf" onClick={() => setPicking(true)}>
            {conference.name} <span className="faint">· {conference.city} · {d.days} {d.month}</span>
          </button>
        )}
      </div>
      {/* Reads as a control, not a label. It was just the rep's name before,
          which looked like text and left no visible way back to the picker. */}
      <button className="cap-bar-rep" onClick={onSwitchRep}>
        <span className="cap-bar-rep-name">{rep?.name ?? 'Pick rep'}</span>
        <span className="cap-bar-rep-swap">Change</span>
      </button>
    </div>
  )
}

/** What the rep sees the instant a save lands. The repeat-contact fact is the
 *  whole point: knowing you have met someone twice before is far more useful
 *  while they are still in sight than in a report next week. */
function Flash({ result, onDismiss }) {
  const { contact, priorCount, changedJob } = result
  const repeat = priorCount > 0

  useEffect(() => {
    const t = setTimeout(onDismiss, repeat ? 9000 : 3500)
    return () => clearTimeout(t)
  }, [result, repeat, onDismiss])

  return (
    <div className={`cap-flash${repeat ? ' is-repeat' : ''}`} role="status">
      <div>
        <strong>{contact.full_name}</strong> saved
        {repeat && (
          <>
            {' — '}
            <strong>
              {priorCount === 1 ? '2nd time' : `${priorCount + 1}${ordinal(priorCount + 1)} time`} you
              {"'"}ve met them
            </strong>
            {changedJob && (
              <div className="cap-flash-sub">
                {changedJob.field === 'company'
                  ? `Moved from ${changedJob.from} to ${changedJob.to}`
                  : `Now ${changedJob.to}, was ${changedJob.from}`}
              </div>
            )}
          </>
        )}
      </div>
      <button className="cap-flash-x" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  )
}

const ordinal = (n) => (n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

/* The ambiguous middle. Shown before anything is written, because the rep is
 * standing three feet from the person and can simply look - which is a better
 * oracle than any string-distance function.
 *
 * Deliberately NOT a modal with a default action. Both answers are one tap and
 * neither is pre-clicked, because "same person" and "different person" have very
 * different costs and the cheap-looking one is the expensive one. */
function MatchPrompt({ typed, candidates, saving, onSame, onNew, onCancel }) {
  return (
    <div className="match-ask" role="dialog" aria-label="Possible duplicate">
      <div className="match-head">
        Have you met <strong>{typed.fullName.trim()}</strong> before?
      </div>

      {candidates.map((m) => (
        <div key={m.contact.id} className="match-card">
          <div className="match-who">
            <strong>{m.contact.full_name}</strong>
            <span className="muted">
              {m.contact.current_title ? ` · ${m.contact.current_title}` : ''}
              {m.contact.current_company ? ` · ${m.contact.current_company}` : ''}
            </span>
          </div>
          <ul className="match-why">
            {m.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <button className="match-yes" disabled={saving} onClick={() => onSame(m.contact.id)}>
            Yes — same person
          </button>
        </div>
      ))}

      <div className="match-actions">
        <button className="match-no" disabled={saving} onClick={onNew}>
          No — someone new
        </button>
        <button className="match-cancel" disabled={saving} onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  )
}

/* Who is using this device.
 *
 * A plain grid of everyone works at four people and becomes a scroll at twenty -
 * and this is the very first screen a rep sees, on a phone, usually in a hurry.
 * Search is always visible rather than appearing once the team grows, because a
 * control that shows up only sometimes is one nobody learns to reach for. */
function RepPicker({ reps, onPick }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle
      ? reps.filter((r) => `${r.name} ${r.home_city ?? ''}`.toLowerCase().includes(needle))
      : reps
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [reps, q])

  return (
    <div className="cap-reppick">
      <h2>Who's capturing?</h2>
      <p className="muted">Picked once, remembered on this device.</p>

      <input
        className="cap-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Find your name… (${reps.length})`}
        autoComplete="off"
      />

      <div className="cap-repgrid">
        {filtered.map((r) => (
          <button key={r.id} className="cap-repbtn" onClick={() => onPick(r.id)}>
            <strong>{r.name}</strong>
            <span className="faint">{r.home_city}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          Nobody matches “{q.trim()}”.
        </p>
      )}
    </div>
  )
}
