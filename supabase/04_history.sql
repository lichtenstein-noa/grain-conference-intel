-- Grain Conference Intelligence - past editions + demo relationship history
-- Run AFTER 01-03. Safe to re-run.
--
-- TWO THINGS IN HERE
--
-- 1. PAST CONFERENCE EDITIONS. Encounters have to point at the event where they
--    happened, so the database needs the 2025/2026 editions people were actually
--    met at. These are filtered out of the planning view by default - a past
--    event is noise when you are deciding where to go - but they surface in a
--    contact's relationship arc, which is the only place they matter.
--    All dates verified, same rule as the rest of the calendar.
--
-- 2. DEMO RELATIONSHIP HISTORY. Six contacts, deliberately built as one test
--    case per verdict the arc analysis has to produce. If the analysis is any
--    good it should reach a different conclusion about each of them, and be able
--    to say why. They are also the fixtures to check the logic against when the
--    weights change.

-- ---------------------------------------------------------------------------
-- Missing upcoming event: Sibos 2026 is Miami, 28 Sep - 1 Oct 2026. Twelve days
-- out at the time of writing and it was not in the original seed.
-- ---------------------------------------------------------------------------
insert into conferences (
  id, name, start_date, end_date, city, country, region, vertical, est_attendance,
  seg_psp, seg_xborder, seg_travel, seg_fx_exposed,
  buyer_seniority, commercial_intent, cost_tier, date_status, website, notes
) values
('sibos-2026', 'Sibos',
 '2026-09-28','2026-10-01','Miami','USA','NA','banking', 12000,
 3,5,0,3, 5,4,5, 'verified','https://www.swift.com/news-events/events/sibos-2026-miami',
 'Miami Beach Convention Center - Swift''s first Sibos in Miami. 12,000+ attendees, theme "Digital Finance for AI-driven Economies", with a dedicated payments/securities/FX stream. Correspondent banking and cross-border rails at the most senior level.'),

-- === Past editions - history only, hidden from planning by default ==========
('money2020-usa-2025', 'Money20/20 USA',
 '2025-10-26','2025-10-29','Las Vegas','USA','NA','payments', 11000,
 5,4,1,2, 5,5,5, 'verified','https://us.money2020.com/',
 'Past edition. The Venetian, Las Vegas.'),

('eurofinance-itm-2025', 'EuroFinance International Treasury Management',
 '2025-10-15','2025-10-17','Budapest','Hungary','EMEA','treasury', 2500,
 1,2,2,5, 5,4,3, 'verified','https://www.eurofinance.com/international-treasury-event/',
 'Past edition. 34th annual, Budapest.'),

('sff-2025', 'Singapore FinTech Festival',
 '2025-11-12','2025-11-14','Singapore','Singapore','APAC','fintech', 65000,
 4,4,1,2, 4,3,5, 'verified','https://www.fintechfestival.sg/',
 'Past edition. 10th anniversary, Singapore EXPO.'),

('itb-berlin-2026', 'ITB Berlin',
 '2026-03-03','2026-03-05','Berlin','Germany','EMEA','travel', 100000,
 1,3,5,1, 3,5,4, 'verified','https://www.itb.com/en',
 'Past edition. Messe Berlin, B2B only.'),

('mpe-berlin-2026', 'MPE - Merchant Payments Ecosystem',
 '2026-03-17','2026-03-19','Berlin','Germany','EMEA','payments', 1600,
 5,3,1,1, 4,5,3, 'verified','https://www.merchantpaymentsecosystem.com/',
 'Past edition. 19th annual, InterContinental Berlin.'),

('money2020-europe-2026', 'Money20/20 Europe',
 '2026-06-02','2026-06-04','Amsterdam','Netherlands','EMEA','payments', 8500,
 5,5,1,3, 5,5,5, 'verified','https://europe.money2020.com/',
 'Past edition. The RAI, Amsterdam.')

on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contacts. Fixed UUIDs so this file is idempotent and the encounters below can
-- reference them without a lookup.
--
-- normalized_name follows the rule in src/lib/names.js: lowercased, accent- and
-- punctuation-stripped, nicknames folded to canonical form, tokens SORTED - so
-- "Chen, Sarah" and "Sarah Chen" produce the same key.
-- ---------------------------------------------------------------------------
insert into contacts (id, full_name, normalized_name, email, current_company, current_title) values

  -- WARMING. The one to close. Three meetings, promoted twice at the same
  -- company, signals escalate browsing -> pricing -> demo + timeline + a colleague.
  ('c0000001-0000-4000-8000-000000000001', 'Sarah Chen', 'chen sarah',
   's.chen@corridorpay.com', 'Corridor Pay', 'Head of Treasury'),

  -- TIRE-KICKER. Four meetings across eleven months, never once asked a
  -- commercial question. The polite listener the brief asks us to detect.
  ('c0000002-0000-4000-8000-000000000002', 'Marcus Feldman', 'feldman marcus',
   'm.feldman@northwindtravel.com', 'Northwind Travel Group', 'VP Finance'),

  -- JOB CHANGE + NAME VARIANT. Captured as "Bob Okonkwo" in Vegas, "Robert
  -- Okonkwo" in Amsterdam, and at a different employer the second time. The
  -- nickname fold in names.js is what keeps these one person.
  ('c0000003-0000-4000-8000-000000000003', 'Robert Okonkwo', 'okonkwo robert',
   'r.okonkwo@latticefinancial.com', 'Lattice Financial', 'Director of Treasury'),

  -- DORMANT. Strongest signals of anyone here - budget named, demo requested -
  -- and then ten months of silence. A dropped ball, not a bad lead.
  ('c0000004-0000-4000-8000-000000000004', 'Priya Raghunathan', 'priya raghunathan',
   'p.raghunathan@volantelogistics.com', 'Volante Logistics', 'Group Treasurer'),

  -- DUPLICATE-NAME FIXTURE. Meet a different David Kim at another company and
  -- the matcher must ASK rather than silently merge two real people.
  ('c0000005-0000-4000-8000-000000000005', 'David Kim', 'david kim',
   'd.kim@cloudpay.io', 'CloudPay Solutions', 'Head of Payments'),

  -- STALLED. Identical conversation three times running. Interested, not moving.
  ('c0000006-0000-4000-8000-000000000006', 'Anna Weiss', 'anna weiss',
   'a.weiss@tessera.com', 'Tessera Bedbank', 'CFO')

on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Encounters. company_at_time / title_at_time are snapshots taken at the event,
-- which is what makes promotions and employer changes visible later.
--
-- Note the rep spread: several of these people were met by DIFFERENT reps at
-- different events. That is the case a spreadsheet handles worst and the reason
-- a shared tool earns its keep - Daniel met Sarah in Berlin, Maya is about to
-- meet her in Barcelona, and neither would have known without this.
-- ---------------------------------------------------------------------------
insert into encounters
  (contact_id, conference_id, rep_id, met_on, company_at_time, title_at_time,
   temperature, signals, notes)
values

-- --- Sarah Chen: browsing -> pricing -> demo, promoted twice ----------------
('c0000001-0000-4000-8000-000000000001', 'money2020-usa-2025',   'sofia',  '2025-10-27',
 'Corridor Pay', 'Payments Operations Manager', 'cold', '{just_browsing}',
 'Stopped at the stand for two minutes. Mostly wanted to know what we do. Polite, no follow-up asked for.'),

('c0000001-0000-4000-8000-000000000001', 'mpe-berlin-2026',      'daniel', '2026-03-18',
 'Corridor Pay', 'Head of Payments', 'warm', '{asked_pricing,they_initiated}',
 'Came to find us this time - remembered us from Vegas. Promoted since. Asked how pricing works on monthly hedged volume.'),

('c0000001-0000-4000-8000-000000000001', 'money2020-europe-2026','maya',   '2026-06-03',
 'Corridor Pay', 'Head of Treasury', 'hot', '{requested_demo,named_timeline,brought_colleague}',
 'Brought their CFO to the meeting. Now runs treasury. Wants a demo in July; their budget cycle closes end of September.'),

-- --- Marcus Feldman: eleven months of pleasant nothing ----------------------
('c0000002-0000-4000-8000-000000000002', 'money2020-usa-2025',   'sofia',  '2025-10-28',
 'Northwind Travel Group', 'VP Finance', 'warm', '{just_browsing}',
 'Good conversation about the market. Nothing specific about their own exposure.'),

('c0000002-0000-4000-8000-000000000002', 'sff-2025',             'kenji',  '2025-11-13',
 'Northwind Travel Group', 'VP Finance', 'warm', '{competitor_mentioned}',
 'Says they evaluated a competitor a couple of years back and did not proceed. Still "thinking about it".'),

('c0000002-0000-4000-8000-000000000002', 'itb-berlin-2026',      'daniel', '2026-03-04',
 'Northwind Travel Group', 'VP Finance', 'warm', '{just_browsing}',
 'Third time meeting him. Friendly, asks sharp questions, never moves an inch.'),

('c0000002-0000-4000-8000-000000000002', 'eurofinance-itm-2026', 'maya',   '2026-09-16',
 'Northwind Travel Group', 'VP Finance', 'warm', '{just_browsing,competitor_mentioned}',
 'Almost word for word the same conversation as last year.'),

-- --- Robert Okonkwo: name variant, then a new employer ----------------------
('c0000003-0000-4000-8000-000000000003', 'money2020-usa-2025',   'sofia',  '2025-10-27',
 'Meridian Payments', 'Treasury Lead', 'warm', '{asked_pricing}',
 'Captured as "Bob Okonkwo" on the badge. Asked about pricing for USD/NGN corridors.'),

('c0000003-0000-4000-8000-000000000003', 'money2020-europe-2026','maya',   '2026-06-02',
 'Lattice Financial', 'Director of Treasury', 'warm', '{they_initiated}',
 'Has moved to Lattice since Vegas - bigger role. Came over to say hello unprompted.'),

-- --- Priya Raghunathan: hot, then dropped -----------------------------------
('c0000004-0000-4000-8000-000000000004', 'eurofinance-itm-2025', 'maya',   '2025-10-16',
 'Volante Logistics', 'Group Treasurer', 'hot', '{asked_pricing,named_budget}',
 'Very engaged. They hedge manually in spreadsheets and openly hate it. Said budget exists for this year.'),

('c0000004-0000-4000-8000-000000000004', 'sff-2025',             'kenji',  '2025-11-13',
 'Volante Logistics', 'Group Treasurer', 'warm', '{requested_demo}',
 'Asked us to set up a demo. Nobody followed up afterwards.'),

-- --- David Kim: single encounter, fixture for the duplicate-name case -------
('c0000005-0000-4000-8000-000000000005', 'mpe-berlin-2026',      'daniel', '2026-03-17',
 'CloudPay Solutions', 'Head of Payments', 'warm', '{asked_pricing}',
 'Acquiring side. Interested in how we would sit alongside their existing FX provider.'),

-- --- Anna Weiss: the same meeting, three times ------------------------------
('c0000006-0000-4000-8000-000000000006', 'mpe-berlin-2026',      'daniel', '2026-03-18',
 'Tessera Bedbank', 'CFO', 'warm', '{asked_pricing}',
 'Bedbank, settles in four currencies. Asked what it costs.'),

('c0000006-0000-4000-8000-000000000006', 'money2020-europe-2026','maya',   '2026-06-03',
 'Tessera Bedbank', 'CFO', 'warm', '{asked_pricing}',
 'Asked what it costs, again. Same questions as Berlin.'),

('c0000006-0000-4000-8000-000000000006', 'eurofinance-itm-2026', 'maya',   '2026-09-16',
 'Tessera Bedbank', 'CFO', 'warm', '{asked_pricing}',
 'Third time through the same conversation. Engaged but nothing new is happening.');
