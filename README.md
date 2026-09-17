# Conference Intelligence

Deciding which conferences a sales team should attend, who covers them, and what to do about
the people they keep meeting.

Built for Grain's ICP: PSPs, cross-border payments, travel wholesalers, and corporates
carrying FX exposure.

**Live: https://grain-conference-intel.vercel.app** - no login. The AI features want an
Anthropic key in Settings; without one they show a saved result from a real run.

---

## What it does

**Conferences** - 28 events, every date verified against the organiser's own site. Scored
for ICP fit with the working shown. Sales ops can add events through the app.

**Plan** - coverage across the year, Tier A events nobody is booked on, trips that combine
into one journey, and dates that clash across continents.

**Capture** - phone-first. Name plus one tap, saved in under ten seconds. Tells you on the
spot if you've met this person before.

**Contacts** - the relationship read for anyone met more than once, and a HubSpot export
that carries it.

**AI** - grounded event research: fill an event in from its URL, or ask what else is near a
trip you're already committed to.

## Running it

```bash
npm install
cp .env.example .env.local     # Supabase URL + publishable key
npm run dev
```

Then run `supabase/*.sql` in numbered order in the Supabase SQL editor. Each is idempotent.
The Anthropic key is **not** an environment variable - it goes in the app's Settings and
stays in that browser.

---

## The decisions that matter

### Size is deliberately weak in the score

Web Summit and Singapore FinTech Festival both draw 70,000 people. They score **32 and 73**.

A rep gets 30-50 real conversations out of a three-day event whether 2,000 or 200,000 people
attend. So size saturates rather than scales - capped at 10% of the score, asking "is the
ICP pool big enough to fill a calendar", not "how big is this". Ranking by headcount mostly
ranks by marketing budget.

Cost stays **out** of the fit score and is reported separately, which is what surfaces MPE
Berlin and EuroFinance as better value per dollar than either Money20/20.

Tier cutoffs were calibrated, not chosen: at 70/50 the calendar came out 22 Tier A of 28,
which isn't a prioritisation.

### Contacts and encounters, not leads

A **contact** is a person, stable across years. An **encounter** is one meeting, at one
event, by one rep. Storing flat "leads" makes cross-conference intelligence impossible to
compute; split, it becomes a query - and job changes surface, because each encounter
snapshots the person's title and employer at the time.

### Matching asks instead of merging

Three outcomes, not two. An email match, or the same name at the same company, links
silently. Everything else asks the rep before anything is written.

"Robert Okonkwo, who moved from Meridian to Lattice" and "a second David Kim" produce
*identical evidence* - same name, different employer. No heuristic separates them, and the
rep is standing three feet away and can simply look. A missed match is a duplicate you tidy
up later; a silent wrong merge shows someone a history that never happened.

Nicknames get a lookup table. For ones it doesn't know - `yossi`/`yosef`, `nacho`/`ignacio`
- edit distance is useless: **measured 0% similarity on every nickname pair**, because a
nickname isn't a typo. So a shared surname at the same company is enough to *ask about*,
which works in any language without the code knowing it.

Comparisons are normalised, not literal. `cloudPay solutions` vs `CloudPay Solutions` was
being read as a change of employer - and since that drives the "New role" verdict, a capital
letter could invent a budget that didn't exist.

### The count is the input; the verdict is the output

"Met 3×" can't tell you whether to chase someone. The analysis reads momentum in commercial
signals, temperature trend, authority change and recency decay, and resolves to a verdict
with its reasoning shown.

The capture chips do double duty: faster than typing on a show floor, *and* the structured
input this reads. `just browsing` carries negative weight on purpose - without an honest
"no intent" marker every meeting looks like progress.

The nudge answers one question once. For someone who isn't buying it says **stop**. A tool
that only ever says "follow up" is noise.

Verdicts avoid sales jargon - **Not buying**, **Gone quiet**, **Not moving** - since not
everyone using this is a native English speaker.

### Where AI is used, and where it isn't

Used for turning unstructured prose on organiser websites into a structured row with a
defensible judgement about who's in the room. No rule does that, and nobody does it by hand
forty times a year.

Discovery is anchored to something already committed rather than open-ended: "find me
fintech conferences" invites plausible, non-existent events; "I'm in Berlin March 9-18,
what's within 1,500 km and ten days" is bounded and checkable.

It runs in three steps - **recall** candidate names with no tools (seconds, near-free,
deliberately unverified), **verify** each through the single-event lookup that works because
it has a specific target, then **check proximity in code**, since by then there are real
coordinates and real dates. Anything imagined in step one fails step two. Rejected
candidates are shown with the measurement that ruled them out and a link.

**Not used** for the relationship verdict - that's a transparent rule in `src/lib/arc.js`,
because a rep needs to audit it. Scoring, matching, clustering and the arc are all
deterministic: no model call, no cost, no latency.

### What the AI cost, and what it taught

The first version burned **$5 in two calls**: `web_fetch` had no `max_content_tokens`, so
whole conference sites came back, and every `pause_turn` re-billed that context. Cost wasn't
linear in the tool budget - it compounded. Now capped per fetch, per turn, and at 90 seconds
wall clock. Every call displays what it spent.

Two findings worth keeping:

- **Lower effort was more expensive.** `effort: low` produced worse search planning, which
  meant more searches.
- **A rate limit looked exactly like an answer.** A blocked search verified nothing, the
  model correctly refused to invent events, and the UI announced *"this trip is already the
  right shape"* - a tooling failure rendered as a product verdict. The model now reports
  whether its search completed.

And: be strict about what you store, generous about what you accept. A strict enum threw
away a correct result because the model wrote "North America" instead of `NA`.

### HubSpot is a file

HubSpot's API rejects cross-origin browser requests, so a live push needs a server holding a
token. The serverless version is ~30 lines and is left out rather than shipped untested; a
file import is how most teams load a conference list anyway.

What's in it matters more than how it gets there. The verdict maps onto HubSpot's **own**
Lead Status, so someone not buying arrives as `Unqualified` and someone ready arrives as
`Open deal` - workable the moment it lands.

### Adding events is a salesperson's job

The model needs `seg_psp` and `seg_fx_exposed` as 0-5 integers. Nobody in sales knows what
to type in a box with that label, so the form asks *"How many payment service providers,
acquirers or payfacs will be there?"* with six plainly-worded answers, and derives the
number.

---

## Security

**There is no authentication**, and that's the main thing to know. Reps identify themselves
with a picker in their browser, and the Supabase publishable key ships in the bundle by
design - so **RLS is the only access control there is**.

The policies carry that weight: reference data is read-only, field data can be inserted and
updated but never deleted, events can be added but not rewritten or removed. A junk row is
visible and reversible; a deleted ITB Berlin is not.

A visitor can still insert junk contacts. That's inherent to a public demo with no login.
The fix is Supabase Auth with per-org policies - about an hour, left out because forcing an
evaluator to create an account before clicking a demo is the worse trade.

One quirk worth knowing: a blocked write returns **`200` with an empty array**, not `403`.
If you add a delete path, check the row count, not the status code.

## Known limits

- **The audience ratings are judgment, not data.** Verified facts, estimated opinions. In
  production they'd come from organiser demographic decks and last year's badge scans - best
  of all, from the tool correcting itself once you've captured leads at an event.
- **Attendance figures are marketing numbers**, inflated by exhibitor staff and day passes.
- **Trip discovery is slow on a new API account** - several calls, lots of web search, and
  low-tier rate limits. Single-event lookup is fast and dependable.
- **Phonetic variants fail.** `Shaun`/`Sean` creates two contacts. Needs Metaphone.
- **An event with no coordinates is invisible to trip clustering.** The form takes them
  manually.

## What's next

1. Supabase Auth and per-org RLS.
2. Ratings that learn from captured leads - after one cycle we *know* what a room contained.
3. Phonetic matching and per-locale nickname sets.
4. Offline capture: show floors have bad wifi, and a lost lead is worse than a slow one.
5. The HubSpot proxy, so the push is live rather than a file.
