-- Grain Conference Intelligence - tightened access policies
-- Run AFTER 01_schema.sql and 02_seed.sql. Safe to re-run.
--
-- WHY THIS FILE EXISTS
--
-- This app has no backend and no login, so the Supabase publishable key ships
-- inside the JavaScript bundle where any visitor can read it. That is normal and
-- expected - the key is an identifier, not a secret. It means row level security
-- is the ONLY thing standing between a visitor and the database, so the policies
-- have to carry the whole weight.
--
-- The first pass used `for all ... using (true)` on every table, which let any
-- visitor delete the entire dataset. These policies grant only what the app
-- actually does:
--
--   conferences, reps        read only     - reference data, edited by sales ops
--                                            in the Supabase table editor
--   contacts, encounters     read + write  - but NOT delete; nothing in the app
--                                            deletes a person or a meeting
--   coverage                 read + write  - including delete, because un-
--                                            assigning a rep from an event is a
--                                            real action and the rows are cheap
--
-- A visitor can still insert junk contacts. That is inherent to a public demo
-- with no login and is accepted; the fix is authentication, which is the note
-- below.
--
-- PRODUCTION SHAPE: reps authenticate via Supabase Auth, `rep_id` is derived
-- from auth.uid() rather than a localStorage picker, and these policies narrow
-- to "your org's rows" - contacts and encounters scoped by tenant, writes
-- scoped to the authenticated rep. None of that is hard; it is left out because
-- forcing an evaluator to create an account to click a demo is a worse trade.

-- ---------------------------------------------------------------------------
-- Clear the permissive first-pass policies
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['reps', 'conferences', 'contacts', 'encounters', 'coverage'] loop
    execute format('drop policy if exists "demo_open_access" on %I', t);
    execute format('drop policy if exists "read_all"    on %I', t);
    execute format('drop policy if exists "insert_all"  on %I', t);
    execute format('drop policy if exists "update_all"  on %I', t);
    execute format('drop policy if exists "delete_all"  on %I', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data: readable by everyone, writable by nobody through the API.
-- Sales ops still edits these in the Supabase dashboard, which authenticates
-- separately and is unaffected by these policies.
-- ---------------------------------------------------------------------------
create policy "read_all" on conferences for select to anon, authenticated using (true);
create policy "read_all" on reps        for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Field data: capture and enrich, but never destroy. Omitting a delete policy
-- is what blocks deletes - there is no "deny" to write, absence is denial.
-- ---------------------------------------------------------------------------
create policy "read_all"   on contacts for select to anon, authenticated using (true);
create policy "insert_all" on contacts for insert to anon, authenticated with check (true);
create policy "update_all" on contacts for update to anon, authenticated using (true) with check (true);

create policy "read_all"   on encounters for select to anon, authenticated using (true);
create policy "insert_all" on encounters for insert to anon, authenticated with check (true);
create policy "update_all" on encounters for update to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Coverage: full access. Unassigning a rep from an event is a legitimate action
-- and these rows are trivially re-seeded.
-- ---------------------------------------------------------------------------
create policy "read_all"   on coverage for select to anon, authenticated using (true);
create policy "insert_all" on coverage for insert to anon, authenticated with check (true);
create policy "update_all" on coverage for update to anon, authenticated using (true) with check (true);
create policy "delete_all" on coverage for delete to anon, authenticated using (true);
