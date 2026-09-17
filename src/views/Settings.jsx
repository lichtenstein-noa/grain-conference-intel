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
        Keys are stored in this browser only — never in the code, never on our server.
        Each person using the tool supplies their own.
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
        Powers event research and trip discovery. Get one at{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com
        </a>
        {' '}— add credit to the account first, or calls fail with a balance error that looks
        like a broken integration. The AI features stay visible without a key, using saved
        example results.
        {getAnthropicKey() && <> Currently set: <code>{maskKey(getAnthropicKey())}</code>.</>}
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
        {MODELS.find((m) => m.id === model)?.note}. Most of the research job — call a search,
        read a page, pull out dates and a headcount — sits well within Sonnet. The part that
        might not is rating who’s in the room, which asks the model to follow a deliberately
        counterintuitive rule. Worth testing on ITB Berlin: the right answer is travel 5,
        treasury 1. Each call shows what it cost, so the comparison is measurable.
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
        Used to push captured leads into HubSpot. Without it, leads export as a
        HubSpot-ready file instead.
      </p>

      <div className="addconf-actions">
        <button className="cap-save" onClick={save}>{saved ? 'Saved' : 'Save keys'}</button>
      </div>

      <p className="settings-note">
        <strong>Why it works this way.</strong> The app has no backend, so it calls the
        Anthropic API straight from your browser with the key you paste here. It is stored in
        this browser’s localStorage and sent only to Anthropic. Deliberately there is no
        environment variable for it: Vite compiles anything named <code>VITE_*</code> into the
        JavaScript it ships, so a key set that way would be published to every visitor. In
        production these calls would route through a small server-side proxy and a rep would
        never handle a key at all.
      </p>
    </div>
  )
}
