import { createClient } from '@supabase/supabase-js'

// Optional chaining so these modules can also be imported by plain Node for
// testing, where import.meta.env does not exist.
const url = import.meta.env?.VITE_SUPABASE_URL
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY

// Surfaced in the UI rather than thrown, so a missing .env.local produces a
// readable instruction instead of a blank white screen.
export const configError =
  !url || !anonKey || url.includes('YOUR-PROJECT-REF')
    ? 'Supabase is not configured. Copy .env.example to .env.local, fill in your project URL and anon key, then restart the dev server.'
    : null

export const supabase = configError ? null : createClient(url, anonKey)
