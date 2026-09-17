-- Grain Conference Intelligence - schema
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- DEMO SCOPE: there is no authentication. Reps identify themselves with a
-- picker stored in localStorage, so RLS is the only access control there is -
-- the publishable key ships in the browser bundle and is not a secret.
--
-- This file enables RLS and leaves it locked down with no policies. Run
-- 03_policies.sql to grant the specific access the app needs: reference data
-- read-only, field data insert/update but never delete. Do not go back to a
-- blanket `for all using (true)` policy - that lets any visitor drop the whole
-- dataset, including the 28 conferences whose dates took an hour to verify.

-- ---------------------------------------------------------------------------
-- reps
-- ---------------------------------------------------------------------------
create table if not exists reps (
  id          text primary key,
  name        text not null,
  home_city   text,
  home_region text,           -- NA | EMEA | APAC | LATAM
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- conferences
--
-- This table stores FACTS about each event. The ICP score is NOT stored - it is
-- computed in the app from these columns so the methodology stays visible,
-- adjustable, and auditable. A stored score would rot the moment the weights
-- change and would hide the reasoning from the user.
-- ---------------------------------------------------------------------------
create table if not exists conferences (
  id                text primary key,
  name              text not null,
  start_date        date not null,
  end_date          date not null,
  city              text not null,
  country           text not null,
  region            text not null,           -- NA | EMEA | APAC | LATAM
  vertical          text not null,           -- payments | treasury | travel | fintech | banking | fx | saas
  est_attendance    integer not null,

  -- ICP segment presence, 0-5 each. Grain sells FX/currency-risk management.
  --
  -- All four measure WHO IS PHYSICALLY IN THE ROOM, not which companies exist in
  -- the industry. That distinction matters: a travel wholesaler is an FX-exposed
  -- company, but the person it sends to ITB Berlin is a contracting manager
  -- buying hotel inventory, not the CFO who owns the hedging decision. Scoring
  -- the same population under both seg_travel and seg_fx_exposed double-counts
  -- it, which is exactly the bug that pushed travel events to the top of the
  -- first ranking. seg_fx_exposed is therefore strictly about the TREASURY AND
  -- FINANCE FUNCTION being present as buyers.
  seg_psp           smallint not null default 0,  -- payment service providers, acquirers, payfacs
  seg_xborder       smallint not null default 0,  -- cross-border payments, remittance, money transfer
  seg_travel        smallint not null default 0,  -- travel wholesalers, bedbanks, OTAs, tour operators
  seg_fx_exposed    smallint not null default 0,  -- treasury / finance buyers, present in person

  -- 0-5: are decision-makers present FOR THIS PRODUCT. Not generic seniority -
  -- a commercial director at a travel show is senior, and cannot sign an FX
  -- contract. A founder at Phocuswright is senior and can.
  buyer_seniority   smallint not null default 0,
  commercial_intent smallint not null default 0,  -- 0-5: deal-making venue vs content/thought-leadership
  cost_tier         smallint not null default 3,  -- 1-5: cost to attend meaningfully (booth+passes+travel)

  date_status       text not null default 'estimated', -- verified | estimated | conflicting
  website           text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists conferences_start_date_idx on conferences (start_date);
create index if not exists conferences_region_idx     on conferences (region);

-- ---------------------------------------------------------------------------
-- contacts  -  a PERSON, with a stable identity across events
--
-- The core modelling decision: we do not store "leads". A lead is a person plus
-- an event mashed together, and it makes cross-conference intelligence
-- impossible to compute. Splitting contacts from encounters means the repeat-
-- contact analysis is a query over history rather than a special case.
--
-- Columns here hold the person's CURRENT state. Their state at the time of each
-- meeting lives on the encounter, which is what lets us detect job changes.
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  normalized_name  text not null,      -- lowercased, unpunctuated, nickname-resolved; the fuzzy match key
  email            text,
  linkedin         text,
  current_company  text,
  current_title    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists contacts_normalized_name_idx on contacts (normalized_name);
create index if not exists contacts_email_idx           on contacts (email);

-- ---------------------------------------------------------------------------
-- encounters  -  ONE meeting, at ONE conference, by ONE rep
--
-- company_at_time / title_at_time are snapshots, deliberately denormalised.
-- Comparing them across a contact's encounters is how the tool notices that
-- someone got promoted or changed employer between events - which is both a
-- matching edge case and a genuine buying signal.
--
-- signals[] is the fast-capture vocabulary: tappable chips on the show floor.
-- They exist to make capture quick, and they double as the structured input the
-- relationship-arc analysis reads. One interaction, two jobs.
-- ---------------------------------------------------------------------------
create table if not exists encounters (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references contacts (id) on delete cascade,
  conference_id   text not null references conferences (id) on delete restrict,
  rep_id          text references reps (id) on delete set null,

  met_on          date not null default current_date,
  company_at_time text,
  title_at_time   text,

  temperature     text check (temperature in ('hot', 'warm', 'cold')),
  signals         text[] not null default '{}',   -- asked_pricing | requested_demo | brought_colleague |
                                                  -- they_initiated | named_timeline | named_budget |
                                                  -- competitor_mentioned | just_browsing
  notes           text,
  ai_extract      jsonb,                          -- structured fields parsed from notes by the AI pass

  created_at      timestamptz not null default now()
);

create index if not exists encounters_contact_idx    on encounters (contact_id);
create index if not exists encounters_conference_idx on encounters (conference_id);
create index if not exists encounters_met_on_idx     on encounters (met_on);

-- ---------------------------------------------------------------------------
-- coverage  -  which rep is working which conference
-- ---------------------------------------------------------------------------
create table if not exists coverage (
  id            uuid primary key default gen_random_uuid(),
  conference_id text not null references conferences (id) on delete cascade,
  rep_id        text not null references reps (id) on delete cascade,
  status        text not null default 'planned' check (status in ('planned', 'confirmed', 'declined')),
  created_at    timestamptz not null default now(),
  unique (conference_id, rep_id)
);

-- ---------------------------------------------------------------------------
-- RLS on, no policies granted here. With RLS enabled and no policy, every table
-- is closed to the anon role - which is the safe default to land in if someone
-- runs this file and forgets the next one. Access is granted in 03_policies.sql.
-- ---------------------------------------------------------------------------
alter table reps        enable row level security;
alter table conferences enable row level security;
alter table contacts    enable row level security;
alter table encounters  enable row level security;
alter table coverage    enable row level security;
