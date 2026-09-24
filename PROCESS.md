# Process overview

## What I built

Degree Plan Checker: a semester-by-semester planner for ANU Computing and
MLCV master's students that warns, before enrolment, when a course would
earn zero credit toward the degree. `README.md` says what good means here.

## How I got here

I started from my own frustration as an MMLCV student and chose, from the
options, the failure that hurts most: a course that counts for nothing. I
directed the scope as a client: plan per link, warnings that never block,
three masters, 2025 onward.

I grounded it in real data, not examples. A scraper reads Programs & Courses
into a committed snapshot, with hand-written overrides that must cite their
source sentence
([`d51f97c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/commit/d51f97c)).
The checker was test-first
([`4137e3e...510b0b0`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/compare/4137e3e...510b0b0)).

Corrections came from checking against reality. The agents caught two wrong
facts in the plan: COMP8600's prerequisite is too tangled to parse, and the
MMLCV pathway is 30 units, not 24. The scrape showed MCOMP only summed to
72/96; asked, I chose to scrape the specialisations rather than fake them
([`9ae9591`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/commit/9ae9591)).
A browser review found past semesters missing from the plan page
([`1ae4eb4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/commit/1ae4eb4)).
Then I used the live app on my own plan and asked for two changes it showed
were missing:

> For the course that not meet the pre requisite give something like I
> enrolled bcs I have the permission.

([`53ef604...d3996b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/compare/53ef604...d3996b4)).

For the look I used the Impeccable skill: I picked a direction in its
browser page and a fresh reviewer checked the build. Its pathway-B screenshot
exposed a real checker bug, fixed test-first
([`6d6c687`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/commit/6d6c687)).

I knew it was right when the reload test passed over HTTP
([`8a93165`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-hadissuryaalamin/commit/8a93165))
and the deployed app flagged a real course in my own plan as zero credit.
