import { useEffect, useMemo, useRef, useState } from 'react'

/* ---------------------------------------------------------------------------
   Assigning reps to an event.

   The first version drew one button per rep on every row. That reads fine with
   the four demo reps and falls apart at real headcount: twenty reps across
   twenty-nine events is 580 circles, and the two that matter - who is actually
   going - are lost in them.

   So the row shows only who IS assigned, and everyone else lives behind one
   button. That inverts the scaling: the row grows with the people going to that
   event (almost always 1-3), not with the size of the company.
--------------------------------------------------------------------------- */

export const initials = (name) =>
  name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

/** Beyond this many assigned, collapse the rest into a +N chip. */
const MAX_SHOWN = 4

export default function RepAssign({ reps, assigned, onToggle, compact = false }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef(null)
  const searchRef = useRef(null)

  const assignedIds = useMemo(
    () => new Set((assigned || []).map((a) => a.rep_id)),
    [assigned],
  )
  const assignedReps = reps.filter((r) => assignedIds.has(r.id))

  // Close on outside click or Escape - a popover you cannot dismiss is a trap.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (open) searchRef.current?.focus() }, [open])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle
      ? reps.filter((r) =>
          `${r.name} ${r.home_city ?? ''}`.toLowerCase().includes(needle))
      : reps
    // Assigned first, so unticking is as quick as ticking.
    return [...list].sort((a, b) => {
      const d = Number(assignedIds.has(b.id)) - Number(assignedIds.has(a.id))
      return d !== 0 ? d : a.name.localeCompare(b.name)
    })
  }, [reps, q, assignedIds])

  const shown = assignedReps.slice(0, MAX_SHOWN)
  const overflow = assignedReps.length - shown.length

  return (
    <div className="repassign" ref={wrapRef}>
      <div className="repassign-row">
        {shown.map((r) => (
          <span key={r.id} className="avatar" title={`${r.name}${r.home_city ? ` — ${r.home_city}` : ''}`}>
            {initials(r.name)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="avatar avatar-more" title={assignedReps.slice(MAX_SHOWN).map((r) => r.name).join(', ')}>
            +{overflow}
          </span>
        )}

        <button
          className={`repassign-btn${assignedReps.length === 0 ? ' is-empty' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          title="Assign reps"
        >
          {assignedReps.length === 0 ? (compact ? '+' : '+ Assign') : '+'}
        </button>
      </div>

      {open && (
        <div className="repassign-pop" role="dialog" aria-label="Assign reps">
          {/* Always present, not gated on team size. It is focused on open, so
              typing a few letters is the fastest path to a rep whatever the
              headcount - and a control that appears only once the list grows is
              one nobody knows exists. */}
          <input
            ref={searchRef}
            className="repassign-search"
            type="search"
            value={q}
            placeholder={`Find a rep… (${reps.length})`}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="repassign-list">
            {filtered.map((r) => {
              const on = assignedIds.has(r.id)
              return (
                <li key={r.id}>
                  <button
                    className="repassign-item"
                    aria-pressed={on}
                    onClick={() => onToggle(r.id)}
                  >
                    <span className={`avatar${on ? ' is-on' : ''}`}>{initials(r.name)}</span>
                    <span className="repassign-name">
                      {r.name}
                      {r.home_city && <span className="faint"> · {r.home_city}</span>}
                    </span>
                    <span className="repassign-tick">{on ? '✓' : ''}</span>
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && <li className="repassign-none">No match</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
