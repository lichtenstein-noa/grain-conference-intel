-- Grain Conference Intelligence - seed data
-- Run AFTER 01_schema.sql. Safe to re-run (upserts on primary key).
--
-- DATE POLICY: every event in this file had its dates confirmed against the
-- organiser's own site or reliable listings in September 2026. Events whose
-- next edition had not published dates yet (ACT Annual Conference 2027,
-- FinovateEurope 2027, Skift Global Forum 2027) were left out rather than
-- guessed, and Seamless Middle East 2027 was dropped because sources actively
-- disagreed (May vs September). A planning tool that invents dates is worse
-- than a smaller one that does not.
--
-- The 0-5 ratings ARE judgment calls about audience composition - they are the
-- opinion layer, and they are meant to be argued with. In production sales ops
-- owns them and edits them directly in the Supabase table editor, and they get
-- corrected by reality: once leads are captured at an event, we know what that
-- room actually contained because we met it.
--
-- REVISION (2026-09-16): seg_fx_exposed was originally rated 3-4 on the travel
-- trade shows, reasoning that a wholesaler buying in EUR and selling in AED is
-- an FX-exposed business. That was wrong in a specific way - it counted the same
-- population twice, once as seg_travel and again as seg_fx_exposed, and pushed
-- ITB, WTM, ATM and FITUR above Money20/20 and EuroFinance in the first ranking.
-- The company has the exposure; the contracting manager it sends to ITB does not
-- own the hedging decision. seg_fx_exposed now strictly means "treasury and
-- finance buyers are in this room", and buyer_seniority means "senior in the
-- function that signs an FX contract" rather than senior in general. Exec-level
-- travel events (Phocuswright, Skift) keep seniority 5, because founders and
-- CEOs genuinely do own this decision.

-- ---------------------------------------------------------------------------
insert into reps (id, name, home_city, home_region) values
  ('maya',   'Maya Ben-Ari',    'Tel Aviv',  'EMEA'),
  ('daniel', 'Daniel Okafor',   'London',    'EMEA'),
  ('sofia',  'Sofia Marchetti', 'New York',  'NA'),
  ('kenji',  'Kenji Watanabe',  'Singapore', 'APAC')
on conflict (id) do update set
  name = excluded.name, home_city = excluded.home_city, home_region = excluded.home_region;

-- ---------------------------------------------------------------------------
insert into conferences (
  id, name, start_date, end_date, city, country, region, vertical, est_attendance,
  seg_psp, seg_xborder, seg_travel, seg_fx_exposed,
  buyer_seniority, commercial_intent, cost_tier, date_status, website, notes
) values

-- === Q4 2026 ================================================================
('eurofinance-itm-2026', 'EuroFinance International Treasury Management',
 '2026-09-16','2026-09-18','Barcelona','Spain','EMEA','treasury', 2600,
 1,2,2,5, 5,4,3, 'verified','https://www.eurofinance.com/international-treasury-event/',
 'CCIB Barcelona, 35th edition. The densest room of corporate treasurers in Europe - 2,600 people, almost all of whom personally own a hedging decision. The clearest evidence that attendance size is a poor proxy for value.'),

('skift-global-forum-2026', 'Skift Global Forum',
 '2026-09-22','2026-09-24','New York','USA','NA','travel', 1400,
 0,1,4,2, 5,2,3, 'verified','https://live.skift.com/skift-global-forum/',
 'North Javits, New York. Travel industry CEOs on stage. Content-led rather than commercial, so poor for lead volume - but one or two conversations here replace a year of trying to get the meeting.'),

('money2020-usa-2026', 'Money20/20 USA',
 '2026-10-18','2026-10-21','Las Vegas','USA','NA','payments', 11500,
 5,4,1,2, 5,5,5, 'verified','https://us.money2020.com/',
 'The Venetian. Where banks, networks and fintechs concentrate their annual partnership meetings. The highest absolute ICP volume in payments - and the most expensive week of the year, so fit is never the question, efficiency is.'),

('wtm-london-2026', 'World Travel Market London',
 '2026-11-03','2026-11-05','London','UK','EMEA','travel', 45000,
 1,2,5,1, 3,5,4, 'verified','https://www.wtm.com/london/en-gb.html',
 'ExCeL London. Travel wholesalers and tour operators settle contracts here, and they carry exactly the exposure Grain hedges: buying in one currency, selling in another, months apart.'),

('afp-2026', 'AFP Annual Conference',
 '2026-11-08','2026-11-11','Las Vegas','USA','NA','treasury', 7000,
 1,2,1,5, 4,4,4, 'verified','https://conference.financialprofessionals.org/',
 'Mandalay Bay. The largest treasury and corporate finance gathering in the world - 7,000+ treasury, payments and FP&A professionals. The US counterpart to EuroFinance.'),

('websummit-2026', 'Web Summit',
 '2026-11-09','2026-11-12','Lisbon','Portugal','EMEA','saas', 70000,
 1,1,1,1, 2,1,3, 'verified','https://websummit.com/web-summit-2026/',
 'Altice Arena and FIL, Lisbon. 70,000 people, almost none of them Grain buyers - founders, press and investors. Identical headcount to Singapore FinTech Festival and a fraction of the value; the control case that proves the scoring model is doing something.'),

('phocuswright-2026', 'The Phocuswright Conference',
 '2026-11-17','2026-11-19','Fort Lauderdale','USA','NA','travel', 1800,
 1,2,4,2, 5,4,4, 'verified','https://www.phocuswrightconference.com/',
 'Diplomat Beach Resort. Small and extremely senior - travel tech operators, executives and investors. Low volume, high conversation quality.'),

('sff-2026', 'Singapore FinTech Festival',
 '2026-11-18','2026-11-20','Singapore','Singapore','APAC','fintech', 70000,
 4,4,1,2, 4,3,5, 'verified','https://www.fintechfestival.sg/',
 'Singapore Expo, 11th edition, 70,000+ attendees from 140+ countries. Genuinely relevant but enormous - signal-to-noise is the real risk. The APAC cross-border corridor story is why you go anyway.'),

('slush-2026', 'Slush',
 '2026-11-18','2026-11-19','Helsinki','Finland','EMEA','saas', 13000,
 1,1,0,1, 2,2,3, 'verified','https://slush.org/',
 'Helsinki Expo. Founders and VCs. Almost no Grain buyers - the kind of event that gets suggested because it is famous, not because it is relevant. Collides exactly with Singapore FinTech Festival.'),

('iltm-cannes-2026', 'ILTM Cannes',
 '2026-11-30','2026-12-03','Cannes','France','EMEA','travel', 10000,
 0,1,4,1, 3,5,4, 'verified','https://www.iltm.com/cannes/en-gb.html',
 'Palais des Festivals. Luxury travel on a strictly pre-scheduled one-to-one appointment model - 2,350+ brands from 112 countries. High-value tour operators with genuine cross-currency settlement, though a narrow slice of the market.'),

-- === H1 2027 ================================================================
('fitur-2027', 'FITUR Madrid',
 '2027-01-20','2027-01-24','Madrid','Spain','EMEA','travel', 250000,
 0,2,5,1, 2,4,3, 'verified','https://www.ifema.es/en/fitur',
 'IFEMA Madrid, with Puerto Rico as 2027 partner country. Vast and heavily LATAM-facing - strong wholesaler presence carrying real LATAM currency exposure, but seniority is diluted by public-sector tourism boards.'),

('fintech-meetup-2027', 'Fintech Meetup',
 '2027-02-22','2027-02-24','Las Vegas','USA','NA','fintech', 5000,
 4,3,1,2, 4,5,4, 'verified','https://www.fintechmeetup.com/home',
 'The Venetian. Built entirely around a double opt-in meetings program - 50,000+ scheduled one-to-one meetings. The highest commercial intent per attendee on this calendar; you leave with a diary, not a pile of badge scans.'),

('mpe-berlin-2027', 'MPE - Merchant Payments Ecosystem',
 '2027-03-09','2027-03-11','Berlin','Germany','EMEA','payments', 1600,
 5,3,1,1, 4,5,3, 'verified','https://www.merchantpaymentsecosystem.com/',
 'InterContinental Berlin, 20th edition. The highest PSP density per attendee anywhere - effectively the European acquiring industry in one hotel. Far cheaper than Money20/20 and arguably better value per conversation. Note: ITB Berlin is in the same city five days later.'),

('mrc-vegas-2027', 'MRC Vegas (Merchant Risk Council)',
 '2027-03-15','2027-03-18','Las Vegas','USA','NA','payments', 2500,
 4,3,3,2, 4,4,3, 'verified','https://merchantriskcouncil.org/events/2027/mrc-vegas-2027',
 'ARIA Resort. Payments, fraud and risk leaders from large merchants - including travel and airlines, an unusually good overlap with Grain''s travel exposure story.'),

('itb-berlin-2027', 'ITB Berlin',
 '2027-03-16','2027-03-18','Berlin','Germany','EMEA','travel', 100000,
 1,3,5,1, 3,5,4, 'verified','https://www.itb.com/en',
 'Messe Berlin, ~10,000 exhibitors from 180+ countries. The world''s contracting floor for travel wholesalers and bedbanks - the single largest concentration of FX-exposed travel businesses on the calendar. 2027 dates shifted once to accommodate Eid al-Fitr.'),

('nacha-payments-2027', 'Nacha Smarter Faster Payments',
 '2027-04-11','2027-04-14','National Harbor','USA','NA','payments', 2400,
 3,3,0,2, 4,3,3, 'verified','https://payments.nacha.org/',
 'Gaylord National Harbor, outside Washington DC. US ACH and payments operations. Domestic focus caps the cross-border relevance, but the banking and PSP operations buyers are real.'),

('pay360-2027', 'PAY360',
 '2027-04-21','2027-04-22','London','UK','EMEA','payments', 2500,
 4,3,1,2, 4,4,3, 'verified','https://pay360event.com/',
 'ExCeL London. The Payments Association''s UK flagship. Strong domestic PSP and fintech turnout, modest cost, trivial for a London-based rep to work.'),

('money2020-asia-2027', 'Money20/20 Asia',
 '2027-04-27','2027-04-29','Bangkok','Thailand','APAC','payments', 3500,
 4,4,2,2, 4,4,4, 'verified','https://asia.money2020.com/',
 'Queen Sirikit National Convention Center. Younger sibling to the US and Europe shows - strong APAC cross-border corridor presence and far easier to actually work than Singapore FinTech Festival.'),

('ipw-2027', 'IPW',
 '2027-05-02','2027-05-06','New Orleans','USA','NA','travel', 5500,
 0,2,5,1, 2,5,3, 'verified','https://www.ipw.com/',
 'Ernest N. Morial Convention Center. US Travel Association''s appointment-driven inbound marketplace - international tour operators buying US product, which means inbound wholesalers carrying USD exposure.'),

('atm-dubai-2027', 'Arabian Travel Market',
 '2027-05-03','2027-05-06','Dubai','UAE','EMEA','travel', 46000,
 1,3,5,1, 3,5,3, 'verified','https://www.wtm.com/atm/en-gb.html',
 'Dubai World Trade Centre. The Middle East''s travel contracting event - wholesalers settling in AED, USD and EUR simultaneously. A textbook Grain exposure profile.'),

('payments-canada-2027', 'Payments Canada SUMMIT',
 '2027-05-04','2027-05-06','Toronto','Canada','NA','payments', 2000,
 3,3,1,2, 4,3,2, 'verified','https://www.thesummit.ca/',
 'Canada''s national payments event. The CAD/USD corridor is a genuine cross-border story, the cost is low, and most vendors ignore it.'),

('seamless-asia-2027', 'Seamless Asia',
 '2027-05-19','2027-05-20','Singapore','Singapore','APAC','payments', 8000,
 4,4,2,2, 3,4,3, 'verified','https://www.terrapinn.com/exhibition/seamless-asia/',
 'Suntec Singapore. Southeast Asian payments and e-commerce - solid APAC coverage at a fraction of Singapore FinTech Festival''s cost.'),

('phocuswright-europe-2027', 'Phocuswright Europe',
 '2027-05-24','2027-05-26','London','UK','EMEA','travel', 1000,
 1,2,4,2, 5,3,3, 'verified','https://www.phocuswrighteurope.com/',
 'European travel-tech executives and investors. Tiny and very senior - a relationship event rather than a lead-volume event.'),

('money2020-europe-2027', 'Money20/20 Europe',
 '2027-06-08','2027-06-10','Amsterdam','Netherlands','EMEA','payments', 8500,
 5,5,1,3, 5,5,5, 'verified','https://europe.money2020.com/',
 'The RAI. Europe''s anchor payments event and the strongest concentration of PSP and cross-border decision makers anywhere on the calendar. Natural anchor for a June European swing - EBAday Rome lands five days later.'),

('ebaday-2027', 'EBAday',
 '2027-06-15','2027-06-16','Rome','Italy','EMEA','payments', 1500,
 4,5,0,2, 4,4,3, 'verified','https://www.ebaday.com/',
 'Roma Convention Center La Nuvola. The Euro Banking Association and Finextra''s payments and transaction banking summit. Small, senior, cross-border native - and five days after Money20/20 Europe, which makes it the obvious trip extension rather than a separate journey.'),

('traveltech-show-2027', 'TravelTech Show',
 '2027-06-23','2027-06-24','London','UK','EMEA','travel', 9000,
 1,2,4,1, 3,4,2, 'verified','https://traveltech-show.com/',
 'ExCeL London. Europe''s travel technology event - decent travel-tech buyer mix at low cost. Co-located with Business Travel Show Europe, so one trip covers both floors.'),

('business-travel-show-2027', 'Business Travel Show Europe',
 '2027-06-23','2027-06-24','London','UK','EMEA','travel', 7000,
 1,2,3,2, 3,4,2, 'verified','https://www.businesstravelshoweurope.com/',
 'ExCeL London, same days as TravelTech Show. Corporate travel buyers and TMCs - a different angle on the same FX problem, since corporate travel programmes settle across currencies constantly.'),

-- === H2 2027 ================================================================
('sibos-2027', 'Sibos',
 '2027-10-11','2027-10-14','Singapore','Singapore','APAC','banking', 9000,
 3,5,0,3, 5,4,5, 'verified','https://www.sibos.com/',
 'Marina Bay Sands - Singapore''s third time hosting. Swift''s flagship: correspondent banking, cross-border rails and transaction banking at the most senior level. Expensive, and bank-weighted rather than PSP-weighted.')

on conflict (id) do update set
  name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
  city = excluded.city, country = excluded.country, region = excluded.region,
  vertical = excluded.vertical, est_attendance = excluded.est_attendance,
  seg_psp = excluded.seg_psp, seg_xborder = excluded.seg_xborder,
  seg_travel = excluded.seg_travel, seg_fx_exposed = excluded.seg_fx_exposed,
  buyer_seniority = excluded.buyer_seniority, commercial_intent = excluded.commercial_intent,
  cost_tier = excluded.cost_tier, date_status = excluded.date_status,
  website = excluded.website, notes = excluded.notes;

-- ---------------------------------------------------------------------------
-- Starting coverage: deliberately incomplete, so the planning view has real
-- gaps to surface rather than a tidy fully-covered calendar.
-- ---------------------------------------------------------------------------
insert into coverage (conference_id, rep_id, status) values
  ('money2020-usa-2026',     'sofia',  'confirmed'),
  ('money2020-usa-2026',     'maya',   'confirmed'),
  ('afp-2026',               'sofia',  'planned'),
  ('wtm-london-2026',        'daniel', 'confirmed'),
  ('sff-2026',               'kenji',  'confirmed'),
  ('eurofinance-itm-2026',   'maya',   'confirmed'),
  ('mpe-berlin-2027',        'daniel', 'planned'),
  ('money2020-europe-2027',  'maya',   'planned')
on conflict (conference_id, rep_id) do nothing;
