/* Who is using this device. Deliberately not authentication - see the note in
 * 01_schema.sql. A rep picks their name once and the phone remembers it, which
 * is all the identity a demo needs and zero friction on a show floor. */

const KEY = 'grain.rep'

export function getRepId() {
  try {
    return localStorage.getItem(KEY) || null
  } catch {
    return null // private mode / blocked site data
  }
}

export function setRepId(id) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* non-fatal: the session just won't persist across reloads */
  }
}
