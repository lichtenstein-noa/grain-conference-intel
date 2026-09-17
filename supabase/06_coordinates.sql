-- Grain Conference Intelligence - put geography on the event, not in the code
-- Run AFTER 05_allow_add_events.sql. Safe to re-run.
--
-- Trip clustering needs to know how far apart two events are. The first version
-- looked that up in a hardcoded city table in src/lib/planning.js, which has an
-- obvious ceiling: any list of cities is incomplete, and an event in a city
-- nobody thought of silently dropped out of clustering.
--
-- Coordinates are a property of the event, so they live on the event. The city
-- table stays, demoted to what it is actually good at - autofilling the form
-- when someone types a city we happen to know. Anything else, and the
-- coordinates come from the row itself (typed in, or supplied by the AI draft).

alter table conferences
  add column if not exists latitude  numeric(8, 5),
  add column if not exists longitude numeric(8, 5);

comment on column conferences.latitude is
  'Approximate venue/city latitude. Used for trip clustering; null means the event is excluded from cluster suggestions.';

-- Backfill every city currently on the calendar.
update conferences set latitude = v.lat, longitude = v.lon
from (values
  ('Amsterdam',        52.37000,    4.90000),
  ('Bangkok',          13.76000,  100.50000),
  ('Barcelona',        41.39000,    2.17000),
  ('Berlin',           52.52000,   13.40000),
  ('Budapest',         47.50000,   19.04000),
  ('Cannes',           43.55000,    7.02000),
  ('Dubai',            25.20000,   55.27000),
  ('Fort Lauderdale',  26.12000,  -80.14000),
  ('Helsinki',         60.17000,   24.94000),
  ('Las Vegas',        36.17000, -115.14000),
  ('Lisbon',           38.72000,   -9.14000),
  ('London',           51.51000,   -0.13000),
  ('Madrid',           40.42000,   -3.70000),
  ('Miami',            25.76000,  -80.19000),
  ('National Harbor',  38.78000,  -77.02000),
  ('New Orleans',      29.95000,  -90.07000),
  ('New York',         40.71000,  -74.01000),
  ('Rome',             41.90000,   12.50000),
  ('Singapore',         1.35000,  103.82000),
  ('Toronto',          43.65000,  -79.38000)
) as v(city, lat, lon)
where conferences.city = v.city;

-- Anything left without coordinates would quietly vanish from clustering, so
-- make that visible rather than discovering it in a demo.
do $$
declare missing int;
begin
  select count(*) into missing from conferences where latitude is null;
  if missing > 0 then
    raise notice 'NOTE: % conference(s) still have no coordinates and will not appear in trip clusters.', missing;
  end if;
end $$;
