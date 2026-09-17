-- Grain Conference Intelligence - let the team add conferences
-- Run AFTER 03_policies.sql. Safe to re-run.
--
-- The tool has to be updatable by the people who use it. Until now `conferences`
-- was read-only through the API, which meant adding next year's events required
-- a Supabase login and hand-editing raw 0-5 columns in a database table. That is
-- a developer's workflow, and the brief asks for something a non-developer can
-- keep current.
--
-- INSERT only - deliberately not UPDATE or DELETE. Anyone can add an event;
-- nobody can quietly rewrite or remove the verified calendar. A junk row is
-- visible, annoying and reversible from the dashboard. A deleted ITB Berlin,
-- or an attendance figure silently changed from 100,000 to 10, is neither.
--
-- This is also what the AI discovery feature needs: "found an event near your
-- trip - add it to the plan" is an INSERT, so the permission is required either
-- way.

drop policy if exists "insert_all" on conferences;

create policy "insert_all" on conferences
  for insert to anon, authenticated
  with check (true);
