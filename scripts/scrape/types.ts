// JSON contract for `data/catalogue/programs.json` and `data/catalogue/courses.json`
// (epic.md section 7.2, 7.4, 8). Field names here are the source of truth the
// scraper pipeline (task 003) writes and the SQLite loader (task 003/005)
// reads — they line up with `src/lib/schema.ts` column names in camelCase.
//
// No network and no DB access in this file, or in parse-program.ts,
// parse-course.ts, parse-prereq.ts, parse-specialisation.ts — those are pure
// functions over HTML strings so they can be unit-tested against saved
// fixtures.

/** `requirement_groups.kind` (epic.md section 8). */
export type RequirementGroupKind = "list" | "filter";

export interface RequirementGroupJson {
  /** Evaluation order — position 0 is tried first (epic.md 9.1). */
  position: number;
  name: string;
  kind: RequirementGroupKind;
  unitsRequired: number;
  /** Course codes, for kind "list". Absent/empty for kind "filter". */
  courses?: string[];
  /** For kind "filter": null/undefined means "any subject". */
  filterSubjects?: string[] | null;
  /** For kind "filter": null/undefined means "any level". */
  filterMinLevel?: number | null;
  /** e.g. "A" / "B" for a project-pathway group; null/undefined otherwise. */
  pathway?: string | null;
  /**
   * Marker course codes whose presence in a plan identifies this pathway as
   * "in use" (epic.md 9.2 pathway auto-detect) — matches
   * `src/lib/checker-types.ts`'s `RequirementGroup.pathwayMarkers`. Only
   * meaningful when `pathway` is set; every group of the same pathway
   * carries the same full marker set (task 003 overrides). Never populated
   * by the parser itself — only by a hand-written `data/overrides/<CODE>.ts`
   * (epic.md 7.3), same as `pathway`.
   *
   * NOTE for task 005: `src/lib/schema.ts`'s `requirement_groups` table has
   * no matching column yet — this field needs a migration to reach
   * `checker-types.RequirementGroup.pathwayMarkers` (logged loudly in
   * updates/003.md).
   */
  pathwayMarkers?: string[];
  /**
   * Specialisation code (e.g. "ARTIF-SPEC") this group belongs to, for a
   * group produced by `parseSpecialisation` and spliced into a program's
   * `groups` by the runner (epic.md 15, task 011). Like `pathway`, groups
   * sharing a `specialisation` code are alternatives to every *other*
   * specialisation's groups, not additive — a real student picks exactly
   * one specialisation. null/undefined for a group that isn't part of a
   * specialisation choice.
   *
   * NOTE for task 005 (DB loader): `src/lib/schema.ts`'s
   * `requirement_groups` table has no matching column yet, and neither does
   * `plans` for the student's chosen specialisation (epic.md 8) — this
   * field needs the same kind of migration `pathwayMarkers` already needs
   * (see updates/003.md). Not added here per this task's brief (must not
   * touch schema.ts/checker*.ts).
   */
  specialisation?: string | null;
}

export interface ProgramJson {
  code: string;
  year: number;
  name: string;
  totalUnits: number;
  /** Program duration in semesters (epic.md D13: duration in years × 2). */
  semesters: number;
  /** Ordered (by `position`) requirement groups this parse could confidently extract. */
  groups: RequirementGroupJson[];
  /**
   * Specialisations this program-year lets a student choose between (epic.md
   * 15, task 011), read from the program page's own "Specialisations" link
   * list — never hard-coded, since the set varies by program and year.
   * Empty for a program with no specialisation choice (e.g. MMLCV).
   */
  specialisations?: { code: string; name: string }[];
  /**
   * Anything the parser could not turn into a group safely — e.g. a
   * project-pathway "Either/Or" block, a rule needing a hand-written
   * override (epic.md 7.3) — plus any field it could not find at all.
   * Never guess: record the gap here and keep going (epic.md 7.2).
   */
  parseWarnings: string[];
}

/**
 * A parsed requisite expression tree (epic.md 18.3, replacing the old flat
 * "single connective" grammar). Two leaf kinds:
 *  - `course`: satisfied by completing the code in an earlier semester, or
 *    the same semester when `allowConcurrent` (the requisite sentence said
 *    "completed or be currently enrolled in").
 *  - `program`: a plan-program-membership condition (e.g. "must be enrolled
 *    in the Master of Computing (Advanced)"), or its negation (a program
 *    *exclusion*, e.g. "not able to enrol in this course if you are
 *    enrolled in ..."). `programCode` is one of the mapped short codes
 *    (VCOMP/MCOMP/MMLCV) when the sentence names a program with a known
 *    mapping, otherwise the program's full name text verbatim (guaranteed
 *    never to equal a real plan's programCode, so it's vacuously satisfied
 *    unless negated — see checker.ts).
 * `and`/`or` nodes combine children, and may nest (explicit parentheses in
 * the source sentence). Anything not confidently parseable this way — unit
 * counts, GPA, permission codes, project-group eligibility, majors, or a
 * genuinely unclear/mixed connective with no grouping to disambiguate it —
 * is left `null` rather than guessed at (see parse-prereq.ts).
 */
export type PrereqLeaf =
  | { kind: "course"; code: string; allowConcurrent: boolean }
  | { kind: "program"; programCode: string; negate: boolean };

export type PrereqExpr =
  | PrereqLeaf
  | { kind: "and"; exprs: PrereqExpr[] }
  | { kind: "or"; exprs: PrereqExpr[] };

export interface CourseJson {
  code: string;
  year: number;
  title: string;
  units: number;
  /** First digit of the course code's number × 1000 (epic.md section 8). */
  level: number;
  offeredS1: boolean;
  offeredS2: boolean;
  /** False when the page has no published offering yet (epic.md 7.1: some
   * future-year pages don't list offerings). */
  offeringKnown: boolean;
  /** Raw requisite sentence as it appears on the page, or null if the page
   * has no requisite text at all. */
  prereqText: string | null;
  /** Parsed form of prereqText, or null if unparsed/unparseable/absent. */
  prereqExpr: PrereqExpr | null;
  /** Course codes named after "Incompatible with" on the page. */
  incompatible: string[];
  /** Times this course can count toward a degree (epic.md 7.3 overrides
   * patch this for repeatable courses like COMP8715/COMP8800; the parser
   * itself always emits the default, 1). */
  repeatableTimes: number;
  parseWarnings: string[];
}
