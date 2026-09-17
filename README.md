# Conference Intelligence

A working tool for deciding which conferences a sales team should attend, who covers them,
and what to do about the people they keep meeting.

Built for Grain's ICP - PSPs, cross-border payments, travel wholesalers, and corporates
carrying FX exposure.

**Live:** https://grain-conference-intel.vercel.app

No login. The AI features need an Anthropic API key, pasted into Settings - without one they
show a saved result from a real run, labelled as such, so nothing is a dead end.

---

## What it does

**Conferences** - 28 real events plus past editions, every date verified against the
organiser's own site. Each is scored for ICP fit with the full working shown: click any row
to see every component, its weight, and the points it contributed. Sales ops can add events
through the app, in plain language rather than raw 0-5 columns.

**Plan** - coverage across the year, Tier A events nobody is booked on, trips that combine
into one journey, and dates that clash across continents.

**Capture** - a phone-first field interface. Name plus one tap, saved in under ten seconds.
It tells you on the spot if you've met this person before, and asks before merging anyone
it isn't sure about.

**Contacts** - the relationship arc for anyone met more than once: warming towards a close,
or a polite listener who has asked nothing commercial in a year? Exports to HubSpot with the
verdict mapped onto Lead Status.

**AI** - grounded event research through two entry points: fill a new event in from its URL,
or ask what else is near something you're already committed to.

---

## Running it

```bash
npm install
cp .env.example .env.local     # add your Supabase URL and publishable key
npm run dev
```

Then in the Supabase SQL editor, run the files in `supabase/` **in numbered order**.
Each is idempotent and safe to re-run.

| File | What it does |
|---|---|
| `01_schema.sql` | Tables. RLS on, no access granted yet. |
| `02_seed.sql` | 4 reps, 28 verified conferences, partial coverage. |
| `03_policies.sql` | Grants exactly the access the app needs - nothing can be deleted. |
| `04_history.sql` | Past editions plus demo relationship history. |
| `05_allow_add_events.sql` | Lets the team add events through the UI. |
| `06_coordinates.sql` | Puts latitude/longitude on the event row. |

The **Anthropic API key is not an environment variable** - you enter it in the app's
Settings panel and it stays in your browser. See "API keys" below.

---

## Decisions worth knowing about

### Scoring: size is deliberately weak

Web Summit and Singapore FinTech Festival both draw 70,000 people. They score **32 and 73**.

A rep gets 30-50 real conversations out of a three-day event regardless of whether 2,000
or 200,000 people attend. So audience size saturates rather than scales - it's capped at
10% of the score and asks "is the ICP pool big enough to fill a calendar", not "how big is
this". Ranking conferences by headcount mostly ranks them by marketing budget.

Cost is kept **out** of the fit score and reported separately as value-per-unit-cost.
Blending them hides the interesting case: an expensive event that's a brilliant fit is
still the right call, it just needs a bigger commitment. That separation is what surfaces
MPE Berlin and EuroFinance as better value per dollar than either Money20/20.

Tier cutoffs were **calibrated, not chosen**. At 70/50 the calendar came out 22 Tier A of
28, which isn't a prioritisation. 82/65 gives 6 / 17 / 5.

### Contacts, not leads

The schema stores **contacts** (a person, stable across years) and **encounters** (one
meeting, at one event, by one rep). Storing flat "leads" - a person and an event mashed
together - makes cross-conference intelligence impossible to compute.

Once split, the repeat-contact analysis is a query over history rather than a special case,
and job changes become visible because each encounter snapshots the person's title and
employer at the time.

### Matching asks instead of merging

Three outcomes, not two. An email match or the same name at the same company links
silently. Everything else **asks the rep**, before anything is written.

The reason: "Robert Okonkwo, who moved from Meridian to Lattice" and "a second David Kim
who works somewhere else" produce *identical evidence* - same name, different employer. No
heuristic separates them. The rep is standing three feet from the person and can just look.

A missed match is a duplicate you tidy up later. A silent wrong merge shows someone a
relationship history that never happened, they act on it, and they stop trusting everything
else the tool says.

Name normalisation handles accents, punctuation, titles, reversed name order, and common
English nicknames. For nicknames it doesn't know - `yossi`/`yosef`, `nacho`/`ignacio` -
edit distance is useless (measured: **0%** similarity on every nickname pair, because a
nickname is not a typo). Instead, a shared surname at the exact same company is enough to
*ask about*, which works in any language without the code knowing it.

### The verdict is the output; the count is the input

"Met 3×" cannot tell you whether to chase someone. The arc analysis reads four things -
momentum in commercial signals, temperature trend, authority change, and recency decay -
and resolves to a readable verdict with its reasoning exposed.

The capture chips are doing double duty: they're faster than typing on a show floor, *and*
they're the structured input this analysis reads. `just browsing` carries negative weight
on purpose - without an honest "no intent" marker, every meeting looks like progress and
the people who never buy are undetectable.

The nudge answers one question once. For someone who isn't buying it says **stop**. A tool
that only ever says "follow up!" is noise, and gets ignored.

Verdicts are written without sales jargon - **Not buying**, **Gone quiet**, **Not moving**
rather than "tire-kicker", "dormant", "stalled". A rep scanning a list shouldn't have to
decode an English idiom about kicking car tyres, and plenty of people using this won't be
native speakers. Each carries a one-line meaning, shown on hover and in full when a contact
is opened.

**Comparisons are normalised, not literal.** Capturing `cloudPay solutions` where the last
encounter said `CloudPay Solutions` was read as a change of employer - and since that drives
the whole "New role" verdict, a capital letter typed on a show floor could invent a fresh
budget and a fresh evaluation that never happened. Company comparison now runs through the
same normaliser as the matcher, which also absorbs Ltd/Inc/GmbH noise.

### Where AI is used, and where it isn't

Used for **grounded event research** - one capability behind two buttons. Both turn
unstructured prose scattered across organiser websites into a structured row with a
defensible judgement about who's in the room. No rule does that, and nobody does it by hand
forty times a year.

Discovery is **anchored to something already committed** rather than open-ended. "Find me
fintech conferences" invites confident, plausible, non-existent events. "I'm in Berlin
March 9-18, what's within 1,500 km and ten days" is bounded and checkable - and tied to a
decision already made, since the flight is paid for. It's offered on any event with a rep
assigned, not only on trips that already cluster: Money20/20 USA has two people booked and
no cluster, and "what else can that Vegas week cover" is exactly the question nothing else
was prompting.

Every result carries the page it was read from, per-rating reasoning, and a dates-confidence
flag. Nothing saves automatically; every draft goes through the same form a hand-typed event
does, with the "I checked these dates" box unticked no matter how confident the model was.

**Not used** for the relationship verdict. That's a transparent rule in `src/lib/arc.js`,
because a rep needs to audit that judgment and a visible rule beats a black box for it.
Scoring, matching, clustering and the arc analysis are all deterministic - no model call, no
cost, no latency.

Each AI call **displays what it cost**. An AI feature whose price only shows up on a billing
page is one you find out about too late.

### Discovery: recall broadly, verify narrowly

The first version asked one call to both *find* candidates and *verify* them. It wandered
for eight minutes: search, evaluate, refine, search again. The two halves want opposite
things - finding is open-ended and doesn't need to be right; verifying is narrow and has to
be exactly right.

Split apart, each half is easy:

1. **Recall** candidate names from memory, with no tools at all. Seconds, near-free, and
   deliberately unverified - the dates it recalls are worthless and get thrown away.
2. **Verify** each one through the single-event lookup, which is fast and reliable precisely
   because it has a specific target. Anything imagined in step 1 fails here and is dropped.
3. **Check proximity in code.** By now there are real coordinates and real dates, so "within
   1,500 km and ten days" is arithmetic. Previously that was a model doing geometry in its
   head and being trusted.

Rejected candidates are reported with the measurement that ruled them out and a link -
*"928 km away, over the 1,500 km limit"* rather than a sentence asking to be believed.

### What the AI cost, and what that taught

The first version burned about **$5 in two calls**. Three mistakes compounded: `web_fetch`
had no `max_content_tokens`, so entire conference sites came back; several accumulated in
one conversation; and every `pause_turn` re-sent that whole context for a fresh billed pass.
Cost wasn't linear in the tool budget - it compounded. Now capped at 6k tokens per fetch,
four searches, four fetches, three turns, and a 90-second wall clock so nothing can hang.

Two findings worth keeping:

**Lower effort was more expensive.** Setting `effort: low` to save money produced worse
search planning, which meant more searches, which cost more than the thinking would have.

**A rate limit looked exactly like an answer.** A blocked search verified nothing, the model
correctly refused to invent events and returned empty - and the UI announced *"this trip is
already the right shape."* A tooling failure rendered as a product verdict. The model now
reports whether its search actually completed, so an empty result says which kind of empty
it is.

**Be strict about what you store, generous about what you accept.** A strict enum on
`region` threw away an entire correct result because the model wrote "North America" instead
of `NA`. Both `region` and `vertical` are now free strings normalised in code, with the
country as a fallback.

### HubSpot: a file, and why

HubSpot's API rejects cross-origin browser requests. There's no client-side
workaround - a live push needs server-side code holding a private app token, which is
the one piece of infrastructure this deliberately doesn't have. So **Contacts → Send to
HubSpot** produces an import file instead. That's a real path: it's how most teams load a
conference list, and it works with no credentials.

The server version is about thirty lines - one serverless function forwarding to
`/crm/v3/objects/contacts`. It's left out rather than shipped untested, because an
integration that looks finished and fails on someone else's machine is worse than an
export that demonstrably works.

**What's in the file matters more than how it gets there.** HubSpot can already get
"we met Sarah Chen" from a badge scan. What it can't get is the read: how many times, in
what direction, what changed, and what to do next.

So the verdict maps onto HubSpot's **own built-in Lead Status** property rather than an
inert custom field:

| In this tool | Arrives in HubSpot as |
|---|---|
| Ready to close | `Open deal` |
| Warming / New role | `In progress` |
| Not moving | `Open` |
| Gone quiet | `Attempted to contact` |
| **Not buying** | **`Unqualified`** |

That last row is the point. A contact who's been friendly across four meetings and eleven
months without ever asking a commercial question arrives already marked unqualified - so
the next rep doesn't spend another year on them because the record looked warm.

Import via **Contacts → Import → File from computer**. Email, name, company, job title and
Lead Status map to built-in properties; the rest need creating once as custom contact
properties (the export panel lists them).

### Adding events is a salesperson's job, not a developer's

The scoring model needs `seg_psp` and `seg_fx_exposed` as 0-5 integers. Nobody in sales
knows what to type in a box with that label, so the form never asks. It asks *"How many
payment service providers, acquirers or payfacs will be there?"* with six plainly-worded
answers, and derives the number.

---

## Security

There is **no authentication**. This is deliberate and it is the main thing to know.

Reps identify themselves with a picker stored in their browser. The Supabase publishable key
ships in the JavaScript bundle - that's by design, it isn't a secret - which means **row
level security is the only access control there is**.

So the policies carry the weight: reference data is read-only, field data can be inserted
and updated but **never deleted**, and events can be added but not rewritten or removed.
A junk row is visible and reversible; a deleted ITB Berlin is not.

A visitor can still insert junk contacts. That's inherent to a public demo with no login.
The fix is authentication - reps sign in through Supabase Auth, `rep_id` comes from the
session instead of a localStorage picker, and policies scope to their organisation. That's
about an hour of work, and it was left out because forcing an evaluator to create an account
before clicking a demo is the worse trade.

One PostgREST quirk worth knowing: a **blocked write returns `200` with an empty array**,
not `403`. RLS filters the rows before the write, so it's a no-op rather than an error. If
you add a delete path, check the returned row count, not the status code.

### API keys

Keys are entered in the app's Settings panel and stored in that browser's `localStorage`.
There is deliberately **no `VITE_ANTHROPIC_API_KEY`** - Vite inlines every `VITE_*` variable
into the bundle it ships, so a key set that way would be published to every visitor.

With no backend, calls go from the browser straight to Anthropic with the key the user
pasted. In production they'd route through a small server-side proxy and a rep would never
handle a key at all.

---

## Known limits

- **The audience ratings are judgment, not data.** Verified facts, estimated opinions. In
  production they'd come from organiser demographic decks, last year's badge scans, and -
  best of all - the tool correcting itself once you've captured leads at an event and know
  what the room actually contained.
- **Attendance figures are marketing numbers.** Organisers count exhibitor staff and day
  passes. It barely moves the score, but it isn't a headcount.
- **Trip discovery is slow and unreliable on a new API account.** It makes several calls and
  needs a lot of web search, and low-tier accounts get rate-limited. Single-event lookup is
  fast and dependable; discovery is the one to be patient with. Without a key it shows a
  saved result from a real run, labelled as such.
- **Phonetic name variants fail.** `Shaun`/`Sean` scores 50% and creates two contacts.
  Needs a phonetic key (Metaphone) alongside the current one.
- **An event with no coordinates is invisible to trip clustering.** The form warns and takes
  them manually.

## What's next

1. Supabase Auth and per-org RLS.
2. Ratings that learn from captured leads instead of being guessed once - after one cycle
   we *know* what a room contained, because we met it.
3. Phonetic matching, and per-locale nickname sets.
4. Offline capture - show floors have bad wifi, and a lost lead is worse than a slow one.
5. The HubSpot serverless proxy, so the push is live rather than a file.
