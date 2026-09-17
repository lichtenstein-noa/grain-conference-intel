/* ---------------------------------------------------------------------------
   User-supplied API keys.

   The brief is explicit: keys are configurable by the user, never hardcoded.
   So the key lives in the browser that typed it and nowhere else - not in the
   repo, not in an environment variable, not in the built bundle.

   Note what is deliberately NOT here: a VITE_ANTHROPIC_API_KEY env var. Vite
   inlines anything prefixed VITE_ straight into the JavaScript it ships, so
   setting one in a hosting dashboard would publish the key to every visitor.
   The convenience is not worth the footgun.

   Consequence worth stating out loud: this calls the Anthropic API directly
   from the browser, which means the key sits in the user's own localStorage and
   travels only to Anthropic. That is fine for a key someone pasted themselves,
   and it is why the SDK needs `dangerouslyAllowBrowser`. In production the call
   would route through a small server-side proxy instead, so a rep never handles
   a key at all.
--------------------------------------------------------------------------- */

const KEYS = {
  anthropic: 'grain.key.anthropic',
  hubspot: 'grain.key.hubspot',
  model: 'grain.model',
}

/* Opus costs 2.5x what Sonnet does per token. Most of this job - call a search
 * tool, read a page, pull out dates and a headcount - is well within Sonnet.
 * The part that might not be is the audience rating, which asks the model to
 * follow a deliberately counterintuitive rule (see RUBRIC in ai.js: travel
 * shows score HIGH on seg_travel and LOW on seg_fx_exposed, even though the
 * companies attending genuinely have FX exposure).
 *
 * Switchable rather than assumed, so the choice can be measured on a real
 * event instead of argued about. */
export const MODELS = [
  { id: 'claude-opus-5',  label: 'Opus 5',   note: '$5 / $25 per Mtok — best judgement' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: '$2 / $10 per Mtok — 2.5x cheaper' },
]

export const DEFAULT_MODEL = 'claude-opus-5'

export const getModel = () => read('model') || DEFAULT_MODEL
export const setModel = (v) => write('model', v)

/** Per-million-token prices, for the cost estimate shown after each call. */
export const PRICING = {
  'claude-opus-5':   { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
}

function read(name) {
  try {
    return localStorage.getItem(KEYS[name]) || ''
  } catch {
    return '' // private mode, blocked site data
  }
}

function write(name, value) {
  try {
    if (value) localStorage.setItem(KEYS[name], value)
    else localStorage.removeItem(KEYS[name])
  } catch {
    /* non-fatal - the key just won't persist across reloads */
  }
}

export const getAnthropicKey = () => read('anthropic')
export const setAnthropicKey = (v) => write('anthropic', v.trim())
export const getHubspotKey = () => read('hubspot')
export const setHubspotKey = (v) => write('hubspot', v.trim())

export const hasAnthropicKey = () => Boolean(getAnthropicKey())

/** Cheap shape check so an obviously-wrong paste is caught before a round trip. */
export function looksLikeAnthropicKey(v) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v.trim())
}

/** Show a key without exposing it - enough to confirm which one is set. */
export function maskKey(v) {
  if (!v) return ''
  return v.length <= 12 ? '••••' : `${v.slice(0, 11)}…${v.slice(-4)}`
}
