# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: ANU School of Computing master's students** in the Master of
  Computing (MCOMP), Master of Computing (Advanced) (VCOMP) or Master of
  Machine Learning and Computer Vision (MMLCV), planning their next semester
  or checking whether their remaining courses will finish the degree.
- **International students are a core case, not an edge case.** A visa or
  scholarship deadline makes a wasted semester slot expensive; the fear is
  enrolling in a course that turns out to count for nothing.
- **Program advisors and convenors** (School of Computing staff) check or
  approve student plans and maintain official course substitutions.

## Product Purpose

Degree Plan Checker lets a student lay out their degree semester by semester
and see, before enrolling, whether each course counts toward a requirement
group. Its core job is the zero-credit warning: flag any course that would
earn nothing toward the degree. It also flags courses placed in a semester
they don't run and courses whose prerequisites aren't done. Success is a
student catching a zero-credit or timing mistake before enrolment, not after.

## Positioning

It checks a real plan against the real rules of the student's own program,
version year and specialisation, scraped from ANU Programs & Courses, and it
says "can't check" instead of guessing when a rule is too complex to read.
ANU's own tools show requirements and let students enrol; they don't tell a
student in advance that a specific planned course will earn zero credit.

## Operating Context

- Used during enrolment planning, typically before each semester, alongside
  the official Programs & Courses pages and ANU's enrolment system.
- Each plan lives at its own link with no login; students bookmark it or
  share it with an advisor.
- Students already partway through their degree enter the courses they have
  completed before planning ahead.
- Permission codes and course substitutions are real parts of the process:
  students can enrol without a listed prerequisite by permission, and staff
  approve substitutions (e.g. COMP6242 Deep Learning counting as COMP8536).

## Capabilities and Constraints

- Programs: MCOMP, VCOMP, MMLCV; program versions 2025, 2026, 2027; MCOMP
  and VCOMP specialisations. Semesters S1 and S2 only.
- Checks: zero credit (undergraduate course as elective, group full, degree
  total reached, duplicate, pathway conflict), semester offering,
  prerequisites, repeatable project courses in consecutive semesters.
- Warnings never block adding a course; a student can mark a prerequisite
  as waived by permission.
- Catalogue data is a committed snapshot of Programs & Courses, refreshed
  deliberately; the live app never fetches from ANU.
- Terminology: "program", "requirement group", "specialisation", "project
  pathway", "zero credit", "permission to enrol", "substitution".
- Open decision: an admin area for program staff to maintain substitutions
  (and possibly other catalogue corrections). Its access control and storage
  are not designed yet (epic section 17).

## Brand Commitments

- Name: Degree Plan Checker.
- Not affiliated with ANU: no ANU logo, no imitation of ANU branding, and
  the footer says the data comes from Programs & Courses with a snapshot
  date.
- Voice: plain, direct and honest. Say "can't check" rather than guess; a
  wrong "this is fine" is worse than an honest "we can't tell".
- 2026-09-25: the client chose ANU's colour palette; the app stays
  unofficial — no logo, no ANU fonts or layout, footer disclaimer kept.

## Evidence on Hand

- Real catalogue snapshot in `data/catalogue/` (24 September 2026), with
  hand-written corrections in `data/overrides/`, each citing its source.
- No testimonials, user counts or endorsements exist; don't invent any.

## Product Principles

1. Correct beats complete: never tell a student a course counts when it
   might not.
2. Warn, don't block: the student decides.
3. Show the reason: every warning says why, in plain words.
4. Stay honest about the data: snapshot date, source, and limits are visible.

## Accessibility & Inclusion

- Status must never be conveyed by colour alone; every badge carries text.
- Must work at phone width with no horizontal scroll.
- Many users read English as a second language: plain wording, no jargon
  beyond ANU's own terms.
