import { useState } from 'react'
import { configError } from './lib/supabase.js'
import Conferences from './views/Conferences.jsx'
import Capture from './views/Capture.jsx'
import Contacts from './views/Contacts.jsx'
import Plan from './views/Plan.jsx'
import Settings from './views/Settings.jsx'
import { hasAnthropicKey } from './lib/settings.js'

const TABS = [
  { id: 'conferences', label: 'Conferences' },
  { id: 'plan',        label: 'Plan' },
  { id: 'capture',     label: 'Capture' },
  { id: 'contacts',    label: 'Contacts' },
]

export default function App() {
  const [tab, setTab] = useState('conferences')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [keySet, setKeySet] = useState(hasAnthropicKey())

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-name">Conference Intelligence</span>
            <span className="brand-rule" aria-hidden="true" />
            <span className="brand-sub">Where to go, who covers it, who we already know</span>
            <button
              className="settings-btn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title={keySet ? 'API keys configured' : 'No API key set'}
            >
              <span className={`keydot${keySet ? ' is-on' : ''}`} aria-hidden="true" />
              Settings
            </button>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                className="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {settingsOpen && (
          <Settings
            onClose={() => setSettingsOpen(false)}
            onChanged={() => setKeySet(hasAnthropicKey())}
          />
        )}

        {configError ? (
          <p className="notice"><strong>Not connected yet.</strong> {configError}</p>
        ) : tab === 'conferences' ? (
          <Conferences />
        ) : tab === 'capture' ? (
          <Capture />
        ) : tab === 'contacts' ? (
          <Contacts />
        ) : (
          <Plan />
        )}
      </main>
    </div>
  )
}
