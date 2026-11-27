# Handoff: a page for the JotForm sync's holds (2026-11-27)

For whoever builds the Friendly Calls & Visits (FC&V) holds page in this
repo. The JotForm sync (`src/jotform-vg/` in `~/dev/tvcri/vg-sync`, board
card VG-202611-528) writes holds to VG's `fcv_hold` table; nothing in the
app shows them yet. This note says what a hold is, what real data looks
like, what the API gives a page today, what it does not, and what is still
the customer's to decide. It is not a design.

In `~/dev/tvcri/vg-sync`: the sync's design is
`docs/superpowers/specs/2026-11-26-jotform-vg-design.md` (sections "VG
changes", "Matching", "Dates", "Holds", "Deferred"), and the go-live note is
`docs/handoff-2026-11-26-jotform-go-live.md`. The LGL sync's holds page,
already built here, is the model: `client/src/features/SyncHolds/`, route
`meta-sync-holds`, reached from Hub › Integrations › "LGL sync". Its own
handoff is vg-sync's `docs/handoff-2026-11-17-holds-ui.md`.

## Why this matters

A held report is missing from every Friends view and download until someone
answers its hold. The customer agreed on 2026-11-25 that Margie resolves the
holds. Each answer is remembered, so a name matched once matches on its own
from then on. The page is how about 160 reports from the backlog reach the
Friends lists at go-live, and how each new report the sync can't place
reaches them afterwards.

## What a hold is

One row in `fcv_hold` per subject, at most one open per subject.

| `kind` | Subject | Staff answer | `detail` |
|---|---|---|---|
| `name` | a typed name, by role (`member` / `volunteer`) and the form's village | this person, or ignore the name | `candidates` (person ids), `reportCount`, `firstVisit`, `lastVisit`, `email` (the volunteer's, if typed) |
| `date` | one report whose visit date is implausible | accept the date, or ignore the report | `visitDate`, `submittedAt`, `rule` (`ahead` / `behind`) |
| `unreadable` | one report the sync could not parse | none: for the engineer | `reason` (for example `time-spent`) |

A name hold covers every report with that role, typed name (normalized) and
village. A report can be held for a name, a date, or both; `fcv_submission.held`
says which one keeps it out of the lists.

How a hold moves:

- Staff post an answer. VG records it (a `fcv_name_match` row for a name, a
  `dateDecision` on the report for a date) and audits it as `fcvHold`. The
  hold **stays open**.
- The sync's next pass, within 5 minutes, applies the answer to every report
  it covers and stops sending the hold, so VG closes it.
- The sync also closes a hold when its cause goes away: the report was
  edited in JotForm or deleted.
- Once a hold is closed, its answer can no longer be changed (409). See
  "Owed with the page".

## What real data looks like

From one full pass of the real form into the dev database (2026-11-27,
counts only):

| | Open holds | Reports behind them |
|---|---|---|
| Name, member | 48 | 91 (at most 8 under one name) |
| Name, volunteer | 15 | 25 (at most 4) |
| Date, visit 90+ days before submission | 48 | 48 |
| Date, visit after submission | 7 | 7 |
| Unreadable | 1 | 1 |
| **Total** | **119** | **162** |

What this means for the page:

- **No name hold has a candidate.** All 63 have `candidates: []`. The
  matcher holds a name when it finds no fit or a tie, and real data gave
  only no-fits. From the dry run, of 91 held member reports: surname in VG
  but first name differs, 50; surname not in VG, 33; fits someone with no
  member record, 8. Both mockups lead with "Possibly: …"; in practice
  **searching for a person is the main path**, not a fallback. Search
  should reach every village, not just the form's, and Dropped members and
  volunteers too (old reports name them). It should only offer people with
  the hold's role (VG refuses others with 422). A real example: a surname
  typed with two letters swapped, on a form naming one village, for a
  member who lives in another. No rule can match it; staff can, and VG
  accepts the answer. The answer is remembered for that typed name and
  the form's village only, so the same misspelling on a form naming
  another village holds again.
- **Most date holds are a backlog.** 48 of 55 are reports filed more than
  90 days after the visit, mostly a June catch-up. The customer has not yet
  said whether to accept these as they are (go-live handoff, question 1).
  If the answer is "accept them all", the page wants an "accept all like
  this" action, or the customer wants a wider window instead.
- Every name hold has a village; none is federation-wide.

The dev database on the workstation holds this pass (a production snapshot
plus the real form), so it is **real data**: build against it, but keep
names and screenshots out of the repos. To get back to before the pass,
restore `~/vg-backups/dev-vg-before-jotform-full-2026-11-27_1202.sql`.
Running another full pass (from `~/dev/tvcri/vg-sync`,
`node src/jotform-vg/main.js --once full --env .env.jotform-dev` with
`WRITE_VG=true` and this branch's API up) changes nothing
unless the form changed, and is how answers given on the page get applied
locally.

## What the API gives a page today

All on PR #165 (branch `jotform-sync`, not merged).

| Call | Permission | Gives |
|---|---|---|
| `GET /friends/sync/holds?state=open\|closed` | `fcv_sync:read` | Holds, newest first, each with `persons`: `{ personId, displayName, village }` for the ids in `detail.candidates` |
| `POST /friends/sync/holds/{holdId}/resolution` | `fcv_sync:resolve` | Name hold: `{ personId }` or `{ ignore: true }`. Date hold: `{ accept: true }` or `{ ignore: true }`. Returns the hold, still open |

No role has `fcv_sync:read` or `fcv_sync:resolve` except the sync's own
role 10 (which has read, not resolve). Granting them is part of this work.

## What the API does not give yet

Each of these is a gap a page will hit; none has a design yet.

1. **Whether a hold has been answered.** Between the answer and the sync's
   next pass (up to 5 minutes), the hold looks exactly as before. A page
   that re-reads holds shows the name as unanswered again, and staff may
   answer twice. The hold should carry its pending answer (from
   `fcv_name_match` or `dateDecision`), or the page should keep it locally.
2. **The reports behind a hold.** `GET /friends` leaves held reports out by
   design, and `GET /friends/sync/submissions` is the sync's raw feed
   (every report, notes and emails included) behind `fcv_sync:read`. A date
   hold carries no names at all, so "Jane Roe visited Mary Major" in mockup A
   cannot be drawn from the hold alone; mockup B's list of visits needs the
   same. Some read of a hold's reports is needed for either layout, and it
   should respect the notes rule decided for card VG-202611-530 (only the
   village lead and a new FC&V Coordinator role see notes).
3. **The village's name.** Holds carry `villageId` only; the page can look
   names up from `GET /villages`.

## Owed with the page

From the design's "Deferred" and the app's independent review (2026-11-26).
These **must ship with the page**:

- **Changing an answer after its hold closes.** A read and edit of
  `fcv_name_match` (change the person, un-ignore a name), and changing or
  clearing a report's `dateDecision`. Gated by `fcv_sync:resolve`, audited.
  Today a wrong click is stuck. The sync already re-applies a changed answer
  to every report on its next pass.
- **Who may see holds.** `fcv_sync:read` also opens the raw feed and the
  remembered answers. Consider letting `fcv_sync:resolve` alone read holds,
  and granting staff only that.
- **The `submittedAt` label.** `GET /friends` declares it a UTC date-time;
  it is JotForm's Eastern wall-clock time. A date hold shows it, so fix the
  label or the value here (or in card VG-202611-530, whichever ships first).

## Decided

- Hub › Integrations gets a second button, "JotForm sync", beside "LGL
  sync" (card VG-202611-528).
- Margie resolves the holds (2026-11-25).
- Junk names (for example "XXX") can be ignored; an ignored name drops the
  whole report, even when the other name on it is real. That rule is an
  open customer question (go-live handoff, question 3); the page should
  word "Ignore" so staff know the report disappears.
- Unreadable holds are for the engineer; staff see at most a count.

## The customer's to decide

1. **Layout, A or B.** Mockups in
   `~/dev/tvcri/vg-sync/.superpowers/brainstorm/334639-1795719550/content/holds-layout.html`
   (git-ignored there, workstation only; invented names). A: the LGL page's shape, grouped
   sections, one row per name, pick in the row; shares code and look with
   the LGL page. B: names on the left, the chosen name's reports on the
   right; more to build, looks different. Show Margie both with the finding
   above: there are no suggestions to pick from, so either layout is mostly
   a person search. B shows the visits before she picks, which may matter
   more now.
2. **The date backlog** (go-live handoff, question 1): accept the late
   reports as they are, one by one, all at once, or by a wider window.
3. **Junk names** (question 3): drop the whole report, or only the
   junk side.
4. **Which village a visit counts for** when the person matched lives in
   another village. A report keeps the form's village, whoever it is
   matched to. So a visit whose member lives in another village shows on
   the form's village's Friends page and under that village in the Hub,
   not on the member's own village's page. The form village's staff see
   the other village's member by name (and the notes, under card
   VG-202611-530's rule). The sync already does this for every match in
   another village (5 members and 18 volunteers in the real run), and
   staff can do it on this page. Nothing breaks either way; the answer
   matters most for the village summaries (cards VG-202611-531 and 532).

## Not this page

- Restoring the Friends button on the village pages and the notes rule:
  card VG-202611-530.
- Summaries of Friends: cards VG-202611-531 and 532.
