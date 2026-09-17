import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { score } from '../lib/scoring.js'
import { CITIES, KNOWN_CITIES, KNOWN_COUNTRIES } from '../lib/planning.js'
import { researchEvent } from '../lib/ai.js'
import { hasAnthropicKey } from '../lib/settings.js'

/* ---------------------------------------------------------------------------
   Add an event.

   The hard part is not the form, it is the ratings. The scoring model needs
   seg_psp, seg_xborder, buyer_seniority and the rest as 0-5 integers - and no
   salesperson knows what to type in a box labelled `seg_fx_exposed`. Asking for
   the raw number is how you end up with a tool only its author can maintain.

   So every rating is asked as a question about the room, in the words a rep
   would use, with six plainly-worded answers. The 0-5 is derived. Same data,
   and the difference between a tool a sales team keeps current and one that
   rots the day the developer leaves.
--------------------------------------------------------------------------- */

const PRESENCE = ['Nobody', 'A handful', 'Some', 'A fair few', 'Lots', 'Most of the room']

const QUESTIONS = [
  {
    col: 'seg_psp',
    q: 'How many payment service providers, acquirers or payfacs will be there?',
    options: PRESENCE,
  },
  {
    col: 'seg_xborder',
    q: 'How many cross-border payment, remittance or money-transfer companies?',
    options: PRESENCE,
  },
  {
    col: 'seg_travel',
    q: 'How many travel wholesalers, bedbanks, OTAs or tour operators?',
    options: PRESENCE,
  },
  {
    col: 'seg_fx_exposed',
    q: 'How many treasury and finance people will actually be in the room?',
    hint: 'Treasury and finance people attending in person - not companies that merely have exposure.',
    options: PRESENCE,
  },
  {
    col: 'buyer_seniority',
    q: 'Will the people who sign off on an FX decision be there?',
    hint: 'Senior in the function that buys, not senior in general.',
    options: ['Never', 'Rarely', 'A few', 'Some', 'Many', 'That is who it is for'],
  },
  {
    col: 'commercial_intent',
    q: 'Is this a place to do business, or a place to listen to talks?',
    options: [
      'Talks only',
      'Mostly content',
      'Some networking',
      'Even mix',
      'Real expo floor',
      'Built around booked meetings',
    ],
  },
]

const COST = [
  null,
  'Cheap - just passes and a flight',
  'Modest - passes, maybe a table',
  'Mid - a small stand',
  'Expensive - proper stand and a team',
  'Flagship spend - the big annual bet',
]

const VERTICALS = ['payments', 'treasury', 'travel', 'fintech', 'banking', 'fx', 'saas']
const REGIONS = ['NA', 'EMEA', 'APAC', 'LATAM']

const BLANK = {
  name: '', website: '', start_date: '', end_date: '',
  city: '', country: '', region: 'EMEA', vertical: 'payments',
  latitude: '', longitude: '',
  est_attendance: '',
  seg_psp: 0, seg_xborder: 0, seg_travel: 0, seg_fx_exposed: 0,
  buyer_seniority: 3, commercial_intent: 3, cost_tier: 3,
  notes: '', verified: false,
}

export default function AddConference({ onSaved, onCancel, seed }) {
  const [f, setF] = useState(seed ? { ...BLANK, ...seed } : BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // AI research state
  const [lookup, setLookup] = useState('')
  const [researching, setResearching] = useState(false)
  const [draft, setDraft] = useState(seed?.reasoning ? seed : null)
  const [aiError, setAiError] = useState(null)

  async function runResearch(e) {
    e.preventDefault()
    if (!lookup.trim() || researching) return
    setResearching(true)
    setAiError(null)
    try {
      const d = await researchEvent(lookup)
      setDraft(d)
      set({
        name: d.name,
        start_date: d.start_date,
        end_date: d.end_date,
        city: d.city,
        country: d.country,
        region: d.region,
        latitude: String(d.latitude),
        longitude: String(d.longitude),
        vertical: d.vertical,
        est_attendance: String(d.est_attendance),
        seg_psp: d.seg_psp,
        seg_xborder: d.seg_xborder,
        seg_travel: d.seg_travel,
        seg_fx_exposed: d.seg_fx_exposed,
        buyer_seniority: d.buyer_seniority,
        commercial_intent: d.commercial_intent,
        cost_tier: d.cost_tier,
        website: d.website || '',
        notes: d.notes || '',
        // Never inherited from the model. A person confirms dates or nobody does.
        verified: false,
      })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setResearching(false)
    }
  }

  const set = (patch) => setF((prev) => ({ ...prev, ...patch }))

  /* Picking a city we know fills in its country, region and coordinates. Typing
   * one we don't know is perfectly fine - it just leaves those to you. */
  function setCity(city) {
    const known = CITIES[city]
    set(known
      ? { city, country: known.country, region: known.region,
          latitude: String(known.at[0]), longitude: String(known.at[1]) }
      : { city })
  }

  /* Live score as they answer. Two jobs: it shows the model is not a black box,
   * and it lets the person sanity-check their own answers - if a event they know
   * is marginal comes out Tier A, one of the answers is wrong. */
  const preview = useMemo(
    () => score({ ...f, est_attendance: Number(f.est_attendance) || 0 }),
    [f],
  )

  const hasCoords = f.latitude !== '' && f.longitude !== ''
  const datesValid = !f.start_date || !f.end_date || f.end_date >= f.start_date
  const canSave =
    f.name.trim() && f.start_date && f.end_date && f.city.trim() &&
    f.country.trim() && Number(f.est_attendance) > 0 && datesValid

  async function submit(e) {
    e.preventDefault()
    if (!canSave || saving) return
    setSaving(true)
    setError(null)

    const id = `${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${f.start_date.slice(0, 4)}`

    const { error: err } = await supabase.from('conferences').insert({
      id,
      name: f.name.trim(),
      start_date: f.start_date,
      end_date: f.end_date,
      city: f.city.trim(),
      country: f.country.trim(),
      region: f.region,
      vertical: f.vertical,
      est_attendance: Number(f.est_attendance),
      latitude: f.latitude === '' ? null : Number(f.latitude),
      longitude: f.longitude === '' ? null : Number(f.longitude),
      seg_psp: f.seg_psp,
      seg_xborder: f.seg_xborder,
      seg_travel: f.seg_travel,
      seg_fx_exposed: f.seg_fx_exposed,
      buyer_seniority: f.buyer_seniority,
      commercial_intent: f.commercial_intent,
      cost_tier: f.cost_tier,
      // Honest by default. Nobody books a flight against an unchecked guess.
      date_status: f.verified ? 'verified' : 'estimated',
      website: f.website.trim() || null,
      notes: f.notes.trim() || null,
    })

    setSaving(false)
    if (err) {
      setError(
        err.code === '23505'
          ? 'An event with that name and year already exists.'
          : err.message,
      )
      return
    }
    onSaved()
  }

  return (
    <form className="addconf" onSubmit={submit}>
      <div className="addconf-head">
        <h3>Add an event</h3>
        <span className={`addconf-score tier-${preview.tier}`}>
          Would score <strong>{preview.fit}</strong> · Tier {preview.tier}
        </span>
      </div>

      {/* Research first, type second. The manual form below stays the fallback,
          and every drafted field is still editable - the model does the tedious
          part, the human keeps the decision. */}
      <div className="ai-lookup">
        <div className="ai-lookup-row">
          <input
            className="cap-input"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="Paste the event URL, or just type its name…"
            onKeyDown={(e) => e.key === 'Enter' && runResearch(e)}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={runResearch}
            disabled={!lookup.trim() || researching || !hasAnthropicKey()}
          >
            {researching ? 'Researching…' : 'Look it up'}
          </button>
        </div>
        <p className="settings-hint">
          {hasAnthropicKey()
            ? 'Reads the event page and fills in everything below. Check it before saving.'
            : 'Add a key in Settings to fill this in automatically, or type it all by hand.'}
        </p>
        {researching && (
          <p className="settings-hint">Reading the event page - this takes a while.</p>
        )}
        {aiError && <p className="addconf-warn">{aiError}</p>}
      </div>

      {draft && <DraftNote draft={draft} />}

      <div className="addconf-grid">
        <label className="fld fld-wide">
          <span>Event name</span>
          <input value={f.name} onChange={(e) => set({ name: e.target.value })}
                 placeholder="e.g. Money20/20 Asia" />
        </label>

        <label className="fld">
          <span>Starts</span>
          <input type="date" value={f.start_date}
                 onChange={(e) => set({ start_date: e.target.value, end_date: f.end_date || e.target.value })} />
        </label>

        <label className="fld">
          <span>Ends</span>
          <input type="date" value={f.end_date} min={f.start_date}
                 onChange={(e) => set({ end_date: e.target.value })} />
        </label>

        <label className="fld">
          <span>City</span>
          <input list="known-cities" value={f.city}
                 onChange={(e) => setCity(e.target.value)} placeholder="Amsterdam" />
          <datalist id="known-cities">
            {KNOWN_CITIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>

        <label className="fld">
          <span>Country</span>
          <input list="known-countries" value={f.country}
                 onChange={(e) => set({ country: e.target.value })} placeholder="Netherlands" />
          <datalist id="known-countries">
            {KNOWN_COUNTRIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>

        <label className="fld">
          <span>Region</span>
          <select value={f.region} onChange={(e) => set({ region: e.target.value })}>
            {REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>

        <label className="fld">
          <span>Vertical</span>
          <select value={f.vertical} onChange={(e) => set({ vertical: e.target.value })}>
            {VERTICALS.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>

        <label className="fld">
          <span>Expected attendance</span>
          <input type="number" min="1" value={f.est_attendance}
                 onChange={(e) => set({ est_attendance: e.target.value })} placeholder="8500" />
        </label>

        <label className="fld fld-wide">
          <span>Event website</span>
          <input type="url" value={f.website}
                 onChange={(e) => set({ website: e.target.value })} placeholder="https://" />
        </label>
      </div>

      {f.city.trim() && !hasCoords && (
        <div className="addconf-warn">
          <p style={{ margin: '0 0 8px' }}>
            <strong>{f.city}</strong> isn’t on file. Saves fine, but trip clustering needs
            coordinates.
          </p>
          <div className="addconf-coords">
            <label className="fld">
              <span>Latitude</span>
              <input type="number" step="0.00001" value={f.latitude}
                     onChange={(e) => set({ latitude: e.target.value })} placeholder="52.37" />
            </label>
            <label className="fld">
              <span>Longitude</span>
              <input type="number" step="0.00001" value={f.longitude}
                     onChange={(e) => set({ longitude: e.target.value })} placeholder="4.90" />
            </label>
            <span className="faint">Right-click the venue in Google Maps to copy them.</span>
          </div>
        </div>
      )}
      {!datesValid && <p className="addconf-warn">The end date is before the start date.</p>}

      <h4 className="addconf-sub">Who will be in the room?</h4>
      <p className="plan-sub">These drive the score. Best guesses are fine.</p>

      {QUESTIONS.map((q) => (
        <Scale
          key={q.col}
          question={q.q}
          hint={q.hint}
          options={q.options}
          value={f[q.col]}
          onChange={(v) => set({ [q.col]: v })}
        />
      ))}

      <Scale
        question="What does it cost to show up properly?"
        options={COST.slice(1)}
        value={f.cost_tier - 1}
        onChange={(v) => set({ cost_tier: v + 1 })}
      />

      <label className="fld fld-wide">
        <span>Notes - why this event matters, or doesn’t</span>
        <textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })}
                  placeholder="Who goes, what the room is like, anything a colleague should know." />
      </label>

      <label className="addconf-check">
        <input type="checkbox" checked={f.verified}
               onChange={(e) => set({ verified: e.target.checked })} />
        <span>
          I checked these dates on the organiser’s site.
          <span className="faint"> Otherwise it’s flagged unverified.</span>
        </span>
      </label>

      {error && <p className="cap-error">{error}</p>}

      <div className="addconf-actions">
        <button className="cap-save" type="submit" disabled={!canSave || saving}>
          {saving ? 'Saving…' : 'Add event'}
        </button>
        <button className="match-cancel" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/* What the model concluded and why.
 *
 * The reasoning is the point, not decoration. A rating of 5 is unverifiable and
 * a rep who cannot check it will eventually stop trusting all of them; "5 -
 * the exhibitor list is almost entirely acquirers and payfacs" is something
 * they can disagree with. Same for the source link and the dates warning: the
 * model is a fast researcher whose work still gets reviewed. */
function DraftNote({ draft }) {
  const r = draft.reasoning || {}
  return (
    <div className="draftnote">
      <div className="draftnote-head">
        <strong>Drafted from the web</strong>
        <span>
          {draft._spend && (
            <span className="spend" title={`${draft._spend.inputTokens.toLocaleString()} in / ${draft._spend.outputTokens.toLocaleString()} out over ${draft._spend.turns} round(s)`}>
              ~${draft._spend.usd.toFixed(3)}
            </span>
          )}
          {draft.source_url && (
            <a href={draft.source_url} target="_blank" rel="noreferrer">
              {new URL(draft.source_url).hostname} ↗
            </a>
          )}
        </span>
      </div>

      {draft.dates_confidence !== 'high' && (
        <p className="draftnote-warn">
Dates read as <strong>{draft.dates_confidence} confidence</strong> - check before anyone books.
        </p>
      )}

      <dl className="draftnote-list">
        {r.segments && <><dt>Who’s in the room</dt><dd>{r.segments}</dd></>}
        {r.seniority && <><dt>Seniority</dt><dd>{r.seniority}</dd></>}
        {r.attendance && <><dt>Attendance figure</dt><dd>{r.attendance}</dd></>}
      </dl>

      <p className="draftnote-foot">All editable. Nothing saves until you press Add.</p>
    </div>
  )
}

/** One question, six plainly-worded answers, 0-5 underneath. */
function Scale({ question, hint, options, value, onChange }) {
  return (
    <div className="scale">
      <div className="scale-q">{question}</div>
      {hint && <div className="scale-hint">{hint}</div>}
      <div className="scale-opts" role="group" aria-label={question}>
        {options.map((label, i) => (
          <button
            key={label}
            type="button"
            className="scale-opt"
            aria-pressed={value === i}
            onClick={() => onChange(i)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
