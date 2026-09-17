# Conference Intelligence

A working tool for deciding which conferences a sales team should attend, who covers them,
and what to do about the people they keep meeting.

Built for Grain's ICP — PSPs, cross-border payments, travel wholesalers, and corporates
carrying FX exposure.

**Live:** _(URL here)_

---

## What it does

**Conferences** — 28 real events, every date verified against the organiser's own site.
Each is scored for ICP fit with the full working shown: click any row to see every
component, its weight, and the points it contributed.

**Plan** — coverage across the year, Tier A events nobody is booked on, trips that combine
into one journey, and dates that clash across continents.

**Capture** — a phone-first field interface. Name plus one tap, saved in under ten seconds.
It tells you on the spot if you've met this person before.

**Contacts** — the relationship arc for anyone met more than once: is this warming towards a
close, or a polite tire-kicker who has been listening for a year?

**AI** — grounded event research, through two entry points: fill a new event in from its
URL, or ask what else is near a trip you've already committed to.

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
| `03_policies.sql` | Grants exactly the access the app needs — nothing can be deleted. |
| `04_history.sql` | Past editions plus demo relationship history. |
| `05_allow_add_events.sql` | Lets the team add events through the UI. |
| `06_coordinates.sql` | Puts latitude/longitude on the event row. |

The **Anthropic API key is not an environment variable** — you enter it in the app's
Settings panel and it stays in your browser. See "API keys" below.

---

## Decisions worth knowing about

### Scoring: size is deliberately weak

Web Summit and Singapore FinTech Festival both draw 70,000 people. They score **32 and 73**.

A rep gets 30–50 real conversations out of a three-day event regardless of whether 2,000
or 200,000 people attend. So audience size saturates rather than scales — it's capped at
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
meeting, at one event, by one rep). Storing flat "leads" — a person and an event mashed
together — makes cross-conference intelligence impossible to compute.

Once split, the repeat-contact analysis is a query over history rather than a special case,
and job changes become visible because each encounter snapshots the person's title and
employer at the time.

### Matching asks instead of merging

Three outcomes, not two. An email match or the same name at the same company links
silently. Everything else **asks the rep**, before anything is written.

The reason: "Robert Okonkwo, who moved from Meridian to Lattice" and "a second David Kim
who works somewhere else" produce *identical evidence* — same name, different employer. No
heuristic separates them. The rep is standing three feet from the person and can just look.

A missed match is a duplicate you tidy up later. A silent wrong merge shows someone a
relationship history that never happened, they act on it, and they stop trusting everything
else the tool says.

Name normalisation handles accents, punctuation, titles, reversed name order, and common
English nicknames. For nicknames it doesn't know — `yossi`/`yosef`, `nacho`/`ignacio` —
edit distance is useless (measured: **0%** similarity on every nickname pair, because a
nickname is not a typo). Instead, a shared surname at the exact same company is enough to
*ask about*, which works in any language without the code knowing it.

### The verdict is the output; the count is the input

"Met 3×" cannot tell you whether to chase someone. The arc analysis reads four things —
momentum in commercial signals, temperature trend, authority change, and recency decay —
and resolves to a readable verdict with its reasoning exposed.

The capture chips are doing double duty: they're faster than typing on a show floor, *and*
they're the structured input this analysis reads. `just browsing` carries negative weight
on purpose — without an honest "no intent" marker, every meeting looks like progress and
tire-kickers are undetectable.

The nudge answers one question once. For a tire-kicker it says **stop**. A tool that only
ever says "follow up!" is noise, and gets ignored.

### Where AI is used, and where it isn't

Used for **grounded event research** — one capability behind two buttons. Both turn
unstructured prose scattered across organiser websites into a structured row with a
defensible judgement about who's in the room. No rule does that, and nobody does it by hand
forty times a year.

Discovery is **anchored to a trip that already exists** rather than open-ended. "Find me
fintech conferences" invites confident, plausible, non-existent events. "I'm in Berlin
March 9–18, what's within 1,500 km and ten days" is bounded and checkable — and tied to a
decision already made, since the flight is paid for.

Every result carries the page it was read from, per-rating reasoning, and a dates-confidence
flag. Nothing saves automatically; every draft goes through the same form a hand-typed event
does, with the "I checked these dates" box unticked no matter how confident the model was.

**Not used** for the relationship verdict. That's a transparent rule in `src/lib/arc.js`,
because a rep needs to audit that judgment and a visible rule beats a black box for it.

Each AI call **displays what it cost**. An AI feature whose price only shows up on a billing
page is one you find out about too late.

### Adding events is a salesperson's job, not a developer's

The scoring model needs `seg_psp` and `seg_fx_exposed` as 0–5 integers. Nobody in sales
knows what to type in a box with that label, so the form never asks. It asks *"How many
payment service providers, acquirers or payfacs will be there?"* with six plainly-worded
answers, and derives the number.

---

## Security

There is **no authentication**. This is deliberate and it is the main thing to know.

Reps identify themselves with a picker stored in their browser. The Supabase publishable key
ships in the JavaScript bundle — that's by design, it isn't a secret — which means **row
level security is the only access control there is**.

So the policies carry the weight: reference data is read-only, field data can be inserted
and updated but **never deleted**, and events can be added but not rewritten or removed.
A junk row is visible and reversible; a deleted ITB Berlin is not.

A visitor can still insert junk contacts. That's inherent to a public demo with no login.
The fix is authentication — reps sign in through Supabase Auth, `rep_id` comes from the
session instead of a localStorage picker, and policies scope to their organisation. That's
about an hour of work, and it was left out because forcing an evaluator to create an account
before clicking a demo is the worse trade.

One PostgREST quirk worth knowing: a **blocked write returns `200` with an empty array**,
not `403`. RLS filters the rows before the write, so it's a no-op rather than an error. If
you add a delete path, check the returned row count, not the status code.

### API keys

Keys are entered in the app's Settings panel and stored in that browser's `localStorage`.
There is deliberately **no `VITE_ANTHROPIC_API_KEY`** — Vite inlines every `VITE_*` variable
into the bundle it ships, so a key set that way would be published to every visitor.

With no backend, calls go from the browser straight to Anthropic with the key the user
pasted. In production they'd route through a small server-side proxy and a rep would never
handle a key at all.

---

## Known limits

- **Attendance figures are marketing numbers.** Organisers count exhibitor staff and day
  passes. It barely moves the score, but it isn't a headcount.
- **The audience ratings are judgment, not data.** Verified facts, estimated opinions. In
  production they'd come from organiser demographic decks, last year's badge scans, and —
  best of all — the tool correcting itself once you've captured leads at an event and know
  what the room actually contained.
- **Phonetic name variants fail.** `Shaun`/`Sean` scores 50% and creates two contacts.
  Needs a phonetic key (Metaphone) alongside the current one.
- **An event with no coordinates is invisible to trip clustering.** The form warns and
  offers to take them manually.

## What's next

1. Supabase Auth and per-org RLS.
2. Ratings that learn from captured leads instead of being guessed once.
3. Phonetic matching, and per-locale nickname sets.
4. Offline capture — show floors have bad wifi, and a lost lead is worse than a slow one.
