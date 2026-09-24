// Pure input/output types for src/lib/checker.ts.
//
// These types are deliberately DB-agnostic: no import from db.ts or
// schema.ts. A later task maps Drizzle rows into these shapes.

/** A prerequisite requirement, parsed from a course's requisite sentence
 * (epic 18.3 / scraper). Mirrors scripts/scrape/types.ts's `PrereqExpr`
 * structurally (no cross-import between the scraper and the app, per the
 * existing architecture) — course leaves carry `allowConcurrent` (satisfied
 * by the same semester, not just an earlier one) and program leaves carry
 * `negate` (a program *exclusion* rather than a membership requirement).
 * `and`/`or` nodes may nest (explicit parentheses in the source). */
export type PrereqExpr =
  | { kind: "course"; code: string; allowConcurrent: boolean }
  | { kind: "program"; programCode: string; negate: boolean }
  | { kind: "and"; exprs: PrereqExpr[] }
  | { kind: "or"; exprs: PrereqExpr[] };

/** One year's catalogue snapshot of a single course code. Course codes can
 * have a different snapshot per catalogue year (offerings, prereqs etc. can
 * change year to year), so the catalogue indexes an array of these per code. */
export interface CatalogueCourse {
  code: string;
  year: number;
  title: string;
  units: number;
  /** First digit of the code's number, times 1000 (COMP6710 -> 6000). */
  level: number;
  offeredS1: boolean;
  offeredS2: boolean;
  offeringKnown: boolean;
  prereqText: string | null;
  prereqExpr: PrereqExpr | null;
  /** Default 1. COMP8715/COMP8800-style repeatable courses set this >1. */
  repeatableTimes: number;
}

export type GroupKind = "list" | "filter";

export interface RequirementGroup {
  id: string;
  /** Evaluation order: courses are placed in the first group (by position)
   * that accepts them and still has room. */
  position: number;
  name: string;
  kind: GroupKind;
  unitsRequired: number;
  /** `list` groups: the course codes that belong to this group. Also used,
   * regardless of group kind, to answer "is this code named anywhere" for
   * the undergraduate-elective rule (9.1 reason 1). */
  courseCodes: string[];
  /** `filter` groups: eligible subject prefixes (e.g. ["COMP", "ENGN"]).
   * null/undefined = any subject. */
  filterSubjects: string[] | null;
  /** `filter` groups: minimum level (e.g. 6000). null/undefined = no floor. */
  filterMinLevel: number | null;
  /** Project-pathway groups only (9.2). Groups without a pathway are never
   * excluded by pathway-conflict handling. */
  pathway: "A" | "B" | null;
  /** Marker course codes whose presence in the plan identifies this pathway
   * as "in use" for pathway auto-detect (9.2). Only meaningful when
   * `pathway` is set. */
  pathwayMarkers: string[];
}

export interface CatalogueProgram {
  code: string;
  year: number;
  name: string;
  totalUnits: number;
  /** Number of semesters in the program (D13: duration * 2). */
  semesters: number;
}

/** Everything the checker needs about the plan's program: the requirement
 * groups (a single, fixed structure - the program's rules, not year-varying
 * in this model) and every catalogue year of every course the plan could
 * reference, keyed by code. */
export interface Catalogue {
  program: CatalogueProgram;
  groups: RequirementGroup[];
  /** code -> that code's catalogue snapshots, one per year it was scraped.
   * A code absent from this map is unknown to the catalogue (never seeded,
   * or an unverified typed code). */
  courses: Record<string, CatalogueCourse[]>;
}

export interface Plan {
  id: string;
  programCode: string;
  startYear: number;
  startSemester: 1 | 2;
  /** 1..N, N = program.semesters. */
  currentSemester: number;
}

export interface PlanCourse {
  id: string;
  /** 1..N. */
  semesterIndex: number;
  courseCode: string;
  /** True when typed as a free-text code rather than picked from the
   * catalogue's known list (D5). */
  unverified: boolean;
  /** D5: assumed 6 units for an unverified code; otherwise the catalogue's
   * unit value. Carried on the plan course (not re-derived here) so the
   * checker never has to guess. */
  units: number;
  level: number;
  /** Tie-break order within a semester ("added order", 9.1). Lower = added
   * earlier. Needs to be strictly increasing across the whole plan, not
   * just within a semester, for pathway auto-detect's "earliest in the
   * plan" rule (9.2) to have a total order. */
  addedOrder: number;
  /** D15 (epic 16): "I have permission to enrol" — set when the student has
   * waived this course's prerequisite check. When true the prerequisite
   * check is skipped entirely (a waiver never hides zero-credit, offering,
   * unverified or pathway messages, only the prerequisite one). */
  prereqWaived: boolean;
}

export type CourseStatus = "counts" | "zero-credit" | "warn" | "unknown";

export interface GroupResult {
  name: string;
  required: number;
  earned: number;
}

export interface CourseResult {
  planCourseId: string;
  status: CourseStatus;
  /** Set only when status is "counts": the group this course fills. */
  groupName?: string;
  messages: string[];
}

export interface EvaluateResult {
  groups: GroupResult[];
  totalEarned: number;
  totalRequired: number;
  courses: CourseResult[];
  /** Plan-level warnings (e.g. the pathway-conflict banner, epic 10). Not
   * part of the literal signature in epic 9 but needed to drive the banner
   * described in epic 10 without the page re-deriving it from message text. */
  warnings: string[];
}
