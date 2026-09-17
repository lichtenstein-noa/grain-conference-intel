import { useState } from 'react'
import {
  getAnthropicKey, setAnthropicKey, getHubspotKey, setHubspotKey,
  looksLikeAnthropicKey, maskKey, getModel, setModel, MODELS,
} from '../lib/settings.js'

export default function Settings({ onClose, onChanged }) {
  const [anthropic, setA] = useState(getAnthropicKey())
  const [hubspot, setH] = useState(getHubspotKey())
  const [model, setM] = useState(getModel())
  const [saved, setSaved] = useState(false)

  const anthropicLooksWrong = anthropic.trim() && !looksLikeAnthropicKey(anthropic)

  function save() {
    setAnthropicKey(anthropic)
    setHubspotKey(hubspot)
    setModel(model)
    setSaved(true)
    onChanged?.()
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div className="settings">
      <div className="settings-head">
        <h3>Settings</h3>
        <button className="match-cancel" onClick={onClose}>Close</button>
      </div>

      <p className="plan-sub">
Stored in this browser only. Everyone uses their own.
      </p>

      <label className="fld fld-wide">
        <span>Anthropic API key</span>
        <input
          type="password"
          value={anthropic}
          onChange={(e) => setA(e.target.value)}
          placeholder="sk-ant-api03-…"
          autoComplete="off"
          spellCheck="false"
        />
      </label>
      {anthropicLooksWrong && (
        <p className="addconf-warn">
          That doesn’t look like an Anthropic key — they start with <code>sk-ant-</code>.
        </p>
      )}
      <p className="settings-hint">
Powers event research. From{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com
        </a> — add credit first, or calls fail. Without a key you still see saved examples.
        {getAnthropicKey() && <> Set: <code>{maskKey(getAnthropicKey())}</code>.</>}
      </p>

      <div className="fld fld-wide" style={{ marginTop: 18 }}>
        <span>Model</span>
        <div className="scale-opts" style={{ marginTop: 4 }}>
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="scale-opt"
              aria-pressed={model === m.id}
              onClick={() => setM(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="settings-hint">
{MODELS.find((m) => m.id === model)?.note}. Sonnet handles the research fine; the
        open question is rating who’s in the room. Test on ITB Berlin — the right answer is
        travel 5, treasury 1.
      </p>

      <label className="fld fld-wide">
        <span>HubSpot private app token</span>
        <input
          type="password"
          value={hubspot}
          onChange={(e) => setH(e.target.value)}
          placeholder="pat-na1-…"
          autoComplete="off"
          spellCheck="false"
        />
      </label>
      <p className="settings-hint">
Not needed — leads export as a HubSpot import file.
      </p>

      <div className="addconf-actions">
        <button className="cap-save" onClick={save}>{saved ? 'Saved' : 'Save keys'}</button>
      </div>

      <p className="settings-note">
<strong>Why you paste a key at all.</strong> No backend, so calls go straight from
        your browser to Anthropic. An environment variable would be worse — Vite compiles
        those into the shipped bundle. In production this would route through a server and a
        rep would never see a key.
      </p>
    </div>
  )
}
