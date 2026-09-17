import { supabase } from './supabase.js'
import { normalizeName } from './names.js'
import { findCandidates } from './matching.js'

export { SIGNALS, TEMPERATURES } from './signals.js'

/**
 * Ask whether we might already know this person, WITHOUT saving anything.
 * The capture screen calls this while the rep is still filling the form, so an
 * ambiguous match can be resolved in the same breath as the capture rather than
 * in a cleanup pass next week.
 */
export async function checkMatches({ fullName, email, company }) {
  return findCandidates({ fullName, email, company })
}

/**
 * Save one encounter, creating or reusing the contact behind it.
 *
 * `linkContactId` is the rep's explicit answer to "is this the same person?".
 * When present it wins over anything the matcher thinks - a human decision is
 * never second-guessed by the heuristic, including the decision that a
 * confident-looking match is actually a different person.
 *
 * Returns the contact, how many times we had met them BEFORE this, and whether
 * their company or title moved since - so the UI can tell the rep something
 * useful while the person is still walking away.
 */
export async function saveEncounter({
  fullName, company, title, email,
  conferenceId, repId, temperature, signals, notes,
  linkContactId = null, forceNew = false,
}) {
  const name = fullName.trim()

  let existing = null
  if (linkContactId) {
    const { data } = await supabase.from('contacts').select('*').eq('id', linkContactId).limit(1)
    existing = data?.[0] ?? null
  } else if (!forceNew) {
    const { autoLink } = await findCandidates({ fullName: name, email, company })
    existing = autoLink?.contact ?? null
  }

  let contact = existing
  let priorCount = 0
  let changedJob = null

  if (existing) {
    const { count } = await supabase
      .from('encounters')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', existing.id)
    priorCount = count ?? 0

    // A company or title change between events is both a matching edge case and
    // a real buying signal - a new employer means a new budget and new authority.
    if (company && existing.current_company &&
        company.trim().toLowerCase() !== existing.current_company.toLowerCase()) {
      changedJob = { field: 'company', from: existing.current_company, to: company.trim() }
    } else if (title && existing.current_title &&
        title.trim().toLowerCase() !== existing.current_title.toLowerCase()) {
      changedJob = { field: 'title', from: existing.current_title, to: title.trim() }
    }

    const { data } = await supabase
      .from('contacts')
      .update({
        current_company: company?.trim() || existing.current_company,
        current_title: title?.trim() || existing.current_title,
        email: email?.trim().toLowerCase() || existing.email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
    contact = data?.[0] ?? existing
  } else {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        full_name: name,
        normalized_name: normalizeName(name),
        email: email?.trim().toLowerCase() || null,
        current_company: company?.trim() || null,
        current_title: title?.trim() || null,
      })
      .select()
    if (error) throw new Error(error.message)
    contact = data[0]
  }

  const { data: enc, error: encError } = await supabase
    .from('encounters')
    .insert({
      contact_id: contact.id,
      conference_id: conferenceId,
      rep_id: repId,
      company_at_time: company?.trim() || null,
      title_at_time: title?.trim() || null,
      temperature,
      signals,
      notes: notes?.trim() || null,
    })
    .select()
  if (encError) throw new Error(encError.message)

  return { contact, encounter: enc[0], priorCount, changedJob }
}
