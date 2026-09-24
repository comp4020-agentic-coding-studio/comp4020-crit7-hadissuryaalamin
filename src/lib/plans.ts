// Plan data access (epic.md section 8). Plan tables (plans, plan_courses)
// are student data — never truncated, never reloaded from the catalogue.
// This is the only place that writes to them.
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { planCourses, plans } from "./schema";
import { evaluate, semesterCalendar } from "./checker";
import {
  findCourseEntries,
  getCatalogueForProgram,
  getProgram,
  getSpecialisationOptions,
} from "./catalogue";
import type {
  EvaluateResult,
  Plan as CheckerPlan,
  PlanCourse as CheckerPlanCourse,
} from "./checker-types";

/** Thrown for bad input at this boundary (form posts) — never for internal
 * bugs. Distinguishing this from a generic Error lets callers (task 006's
 * POST handlers) show a 400 with the message instead of a 500. */
export class PlanValidationError extends Error {}

export type PlanRow = typeof plans.$inferSelect;
export type PlanCourseRow = typeof planCourses.$inferSelect;

export interface CreatePlanInput {
  programCode: string;
  startYear: number;
  startSemester: number;
  currentSemester: number;
  /** Required for a program with specialisation choices (MCOMP/VCOMP);
   * ignored (never an error) for one without (MMLCV) — epic.md 15/D14. */
  specialisation?: string | null;
}

/** First digit of the course code's number, times 1000 (epic.md section 8:
 * "level from code", used for a typed/unverified code). */
function levelFromCode(code: string): number {
  const digitMatch = code.match(/\d/);
  const firstDigit = digitMatch ? Number(digitMatch[0]) : 0;
  return firstDigit * 1000;
}

/** Random URL-safe id, at least 10 characters (epic.md section 8): 9 random
 * bytes base64url-encode to 12 characters. */
function generatePlanId(): string {
  return randomBytes(9).toString("base64url");
}

function getPlanRow(id: string): PlanRow | null {
  return db.select().from(plans).where(eq(plans.id, id)).get() ?? null;
}

/** Validates and creates a plan. Every check here guards a value that came
 * straight off a user's form POST (epic.md section 10): the program must be
 * a real program-year in the loaded catalogue, semesters must be in range,
 * and the specialisation (if the program has any) must be one of that
 * program-year's own options. */
export function createPlan(input: CreatePlanInput): PlanRow {
  const program = getProgram(input.programCode, input.startYear);
  if (!program) {
    throw new PlanValidationError(
      `Unknown program ${input.programCode} for year ${input.startYear}`,
    );
  }
  if (input.startSemester !== 1 && input.startSemester !== 2) {
    throw new PlanValidationError("startSemester must be 1 or 2");
  }
  if (
    !Number.isInteger(input.currentSemester) ||
    input.currentSemester < 1 ||
    input.currentSemester > program.semesters
  ) {
    throw new PlanValidationError(
      `currentSemester must be between 1 and ${program.semesters} for ${input.programCode} ${input.startYear}`,
    );
  }

  const options = getSpecialisationOptions(input.programCode, input.startYear);
  let specialisation: string | null = null;
  if (options.length > 0) {
    if (!input.specialisation || !options.some((o) => o.code === input.specialisation)) {
      throw new PlanValidationError(
        `specialisation is required for ${input.programCode} ${input.startYear} and must be one of: ${options
          .map((o) => o.code)
          .join(", ")}`,
      );
    }
    specialisation = input.specialisation;
  }
  // Programs with no specialisation slot (e.g. MMLCV): whatever was given is
  // silently ignored, never an error (epic.md 15).

  const id = generatePlanId();
  db.insert(plans)
    .values({
      id,
      programCode: input.programCode,
      startYear: input.startYear,
      startSemester: input.startSemester,
      currentSemester: input.currentSemester,
      specialisation,
    })
    .run();

  return getPlanRow(id)!;
}

export function getPlan(id: string): { plan: PlanRow; courses: PlanCourseRow[] } | null {
  const plan = getPlanRow(id);
  if (!plan) return null;
  const courses = db
    .select()
    .from(planCourses)
    .where(eq(planCourses.planId, id))
    .all()
    .sort((a, b) => a.id - b.id);
  return { plan, courses };
}

/** Resolves `courseCode` against the catalogue (any year on record — epic.md
 * section 8's catalogue is a global course dictionary, not scoped per
 * program) and inserts it into the plan. An unrecognised code is stored as
 * unverified, with its level guessed from the code and 6 assumed units
 * (D5). */
export function addCourse(planId: string, semesterIndex: number, courseCode: string): PlanCourseRow {
  const plan = getPlanRow(planId);
  if (!plan) throw new PlanValidationError(`Unknown plan ${planId}`);
  if (!Number.isInteger(semesterIndex) || semesterIndex < 1) {
    throw new PlanValidationError("semesterIndex must be >= 1");
  }
  const program = getProgram(plan.programCode, plan.startYear);
  if (program && semesterIndex > program.semesters) {
    throw new PlanValidationError(`semesterIndex must be between 1 and ${program.semesters}`);
  }

  const code = courseCode.trim().toUpperCase();
  if (!code) throw new PlanValidationError("courseCode must not be empty");

  const entries = findCourseEntries(code);
  let unverified: boolean;
  let level: number;
  let units: number;
  if (entries.length > 0) {
    const { year: calYear } = semesterCalendar(
      { startYear: plan.startYear, startSemester: plan.startSemester as 1 | 2 },
      semesterIndex,
    );
    const exact = entries.find((e) => e.year === calYear);
    const chosen = exact ?? [...entries].sort((a, b) => b.year - a.year)[0]!;
    unverified = false;
    level = chosen.level;
    units = chosen.units;
  } else {
    unverified = true;
    level = levelFromCode(code);
    units = 6;
  }

  const result = db
    .insert(planCourses)
    .values({ planId, semesterIndex, courseCode: code, unverified, units, level })
    .run();
  const newId = Number(result.lastInsertRowid);
  return db.select().from(planCourses).where(eq(planCourses.id, newId)).get()!;
}

export function removeCourse(planId: string, planCourseId: number): void {
  db.delete(planCourses)
    .where(and(eq(planCourses.id, planCourseId), eq(planCourses.planId, planId)))
    .run();
}

/** Loads the plan, builds the checker's Catalogue input restricted to this
 * plan's program-year and chosen specialisation (epic.md 15 — the loader's
 * job; the checker itself never sees specialisation-filtering logic), and
 * calls the pure checker. Returns null if the plan id doesn't exist. */
export function evaluatePlan(planId: string): EvaluateResult | null {
  const found = getPlan(planId);
  if (!found) return null;
  const { plan, courses } = found;

  const catalogue = getCatalogueForProgram(plan.programCode, plan.startYear, plan.specialisation);
  if (!catalogue) {
    throw new PlanValidationError(
      `Catalogue missing for ${plan.programCode} ${plan.startYear} — was this plan's program removed from the catalogue?`,
    );
  }

  const checkerPlan: CheckerPlan = {
    id: plan.id,
    programCode: plan.programCode,
    startYear: plan.startYear,
    startSemester: plan.startSemester as 1 | 2,
    currentSemester: plan.currentSemester,
  };
  const checkerCourses: CheckerPlanCourse[] = courses.map((c) => ({
    id: String(c.id),
    semesterIndex: c.semesterIndex,
    courseCode: c.courseCode,
    unverified: c.unverified,
    units: c.units,
    level: c.level,
    addedOrder: c.id,
  }));

  return evaluate(checkerPlan, checkerCourses, catalogue);
}
