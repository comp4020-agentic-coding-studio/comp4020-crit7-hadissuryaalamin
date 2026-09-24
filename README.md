# Degree Plan Checker

This is a course planner for ANU School of Computing master's students:
Master of Computing (MCOMP), Master of Computing (Advanced) (VCOMP), and
Master of Machine Learning and Computer Vision (MMLCV). You pick your
program, when you started, and which semester you're enrolling in now,
then build your plan semester by semester against your degree's
requirement groups. Its one job: **flag any course that would earn zero
credit toward your degree before you enrol in it**, so you don't waste a
semester slot on a course that doesn't count. It also flags courses
offered in the wrong semester and courses whose prerequisites aren't
done yet. Every plan lives at its own link (`/plan/<id>`), no login —
persistence is the point, not privacy.

## What "good" means here

Good means the zero-credit warning is *correct*; correct matters more
than complete. Where the checker can't tell — a prerequisite too tangled
to parse safely, a course dropped from the catalogue, an offering not
yet published — it says so plainly ("Check P&C", "Unverified course
code", "Offering not published yet") instead of guessing. A wrong "this
is fine" is worse than an honest "we can't tell." Warnings never block
adding a course; they're information, not a gate — the decision stays
yours.

## Enforced by tests vs judged by a person

Enforced by `spec/`, run in `pnpm check`: the checker's rules (one test
per rule — zero-credit reasons, allocation order, pathway conflicts,
timing warnings, unverified codes); the scraper's parsers against saved
real pages, including one requisite that must parse and one that must
stay unparsed; the create-plan / add-course / reload / remove flow over
HTTP; every route returning something sane; this page served in full at
`/readme/`.

Judged by a person: whether the degree data is actually right (scraped
from prose, not a machine-readable feed — see Known limits), whether the
layout holds up in a real browser at phone width, and whether the
wording is clear to someone who isn't the person who built it. A green
`pnpm check` proves the rules behave the way this repo encoded them; it
doesn't prove that encoding matches the real degree rules or that the
page looks right.

## Deliberately not built

- Login, accounts, or private plans — anyone with the link can view and
  edit it.
- Any program other than MCOMP, VCOMP, MMLCV; any bachelor's program; any
  year before 2025.
- The "at least 24 units at 8000 level" rule — not selected by the client.
- Incompatible-course warnings — the data is scraped and stored, no rule
  checks it.
- Live scraping at runtime — the app only reads its own committed
  snapshot.
- Summer and winter sessions — only S1 and S2 exist here.
- Timetable clashes, class sizes, enrolment itself.

## Known limits

- **COMP8600's prerequisite is real but too tangled to parse safely** — a
  mixed AND/OR expression over ten codes with explicit parentheses. The
  parser only resolves a requisite that's codes joined by one connective
  throughout; anything more shows as "Check P&C" rather than being
  guessed at.
- **SOFT-SPEC's stated "maximum of 12 units" doesn't add up against its
  own 24-unit total** once its other blocks are counted, so it's
  hand-corrected to 6 in `data/overrides/`. That balances the numbers; it
  is not a fact read off the page, so treat it as a known soft spot, not
  a verified rule.
- The MMLCV project pathway is 30 units per option, not 24 as an earlier
  reading assumed; the scraper and checker use 30.
- A few specialisation-specific course exclusions are logged as warnings
  rather than enforced, since the data model has no per-course exclusion
  field.
- Every hand-written correction lives in `data/overrides/` and cites the
  exact page and sentence it's based on.

## Data

The catalogue comes from ANU's Programs & Courses website, scraped once
and committed as JSON in `data/catalogue/`. The live app never fetches
from that site — it only reads its own snapshot, loaded into SQLite on
boot. **Snapshot date: 24 September 2026.** Rules change; check the
program's own current page before relying on a plan. To refresh, run
`pnpm scrape` — it re-fetches every seeded program and course page and
rewrites `data/catalogue/*.json` (review the diff before committing).
