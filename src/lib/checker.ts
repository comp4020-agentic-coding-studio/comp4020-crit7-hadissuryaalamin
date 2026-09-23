// The degree-plan checker (epic section 9). Pure: no DB, no import from
// src/lib/db.ts or schema.ts. A later task (005) maps Drizzle rows into the
// input types from ./checker-types and calls evaluate() on each plan render.

import type {
  Catalogue,
  CatalogueCourse,
  CourseResult,
  CourseStatus,
  EvaluateResult,
  GroupResult,
  Plan,
  PlanCourse,
  PrereqExpr,
  RequirementGroup,
} from "./checker-types";

const SEVERITY: Record<CourseStatus, number> = {
  counts: 0,
  unknown: 1,
  warn: 2,
  "zero-credit": 3,
};

function worse(a: CourseStatus, b: CourseStatus): CourseStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

function subjectOf(code: string): string {
  return code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
}

/** Does this requirement group accept a course of this code/level, ignoring
 * whether it currently has room? Shared by group-eligibility search and by
 * pathway-loser detection (a course "belongs to" a pathway group either by
 * being named on its list, or by matching its filter). */
function groupAccepts(group: RequirementGroup, code: string, level: number): boolean {
  if (group.kind === "list") return group.courseCodes.includes(code);
  const subjectOk = !group.filterSubjects || group.filterSubjects.includes(subjectOf(code));
  const levelOk = group.filterMinLevel == null || level >= group.filterMinLevel;
  return subjectOk && levelOk;
}

/** epic 8: plan semester k's calendar year/semester, stepping S1 -> S2 ->
 * next year S1 from (startYear, startSemester). */
export function semesterCalendar(
  plan: Pick<Plan, "startYear" | "startSemester">,
  semesterIndex: number,
): { year: number; semester: 1 | 2 } {
  const idx0 = plan.startSemester - 1; // 0 or 1
  const step = idx0 + (semesterIndex - 1);
  const year = plan.startYear + Math.floor(step / 2);
  const semester = ((step % 2) + 1) as 1 | 2;
  return { year, semester };
}

function semesterStatus(
  plan: Pick<Plan, "currentSemester">,
  semesterIndex: number,
): "completed" | "current" | "future" {
  if (semesterIndex < plan.currentSemester) return "completed";
  if (semesterIndex === plan.currentSemester) return "current";
  return "future";
}

/** Missing prerequisite codes for `expr` given the set of codes already done
 * in strictly earlier semesters. Empty array = satisfied. For an AND, every
 * unmet child's codes are collected; for an OR, if any child is satisfied
 * the whole thing is satisfied, otherwise every option is "needed" (any one
 * would do, but we don't know which the student will pick). */
function missingPrereqCodes(expr: PrereqExpr, done: ReadonlySet<string>): string[] {
  if (expr.kind === "course") {
    return done.has(expr.code) ? [] : [expr.code];
  }
  if (expr.kind === "and") {
    const missing: string[] = [];
    for (const child of expr.exprs) {
      for (const code of missingPrereqCodes(child, done)) {
        if (!missing.includes(code)) missing.push(code);
      }
    }
    return missing;
  }
  // or
  const satisfied = expr.exprs.some((child) => missingPrereqCodes(child, done).length === 0);
  if (satisfied) return [];
  const all: string[] = [];
  for (const child of expr.exprs) {
    for (const code of missingPrereqCodes(child, done)) {
      if (!all.includes(code)) all.push(code);
    }
  }
  return all;
}

function catalogueEntryForYear(
  entries: CatalogueCourse[],
  year: number,
): { entry: CatalogueCourse; fallbackUsed: boolean } {
  const exact = entries.find((e) => e.year === year);
  if (exact) return { entry: exact, fallbackUsed: false };
  const latest = [...entries].sort((a, b) => b.year - a.year)[0]!;
  return { entry: latest, fallbackUsed: true };
}

const PATHWAY_CONFLICT_MESSAGE =
  "Pick one project pathway: you have courses from both A and B";
const UNVERIFIED_MESSAGE = "Unverified course code - not in the ANU catalogue we loaded";
const UNDERGRAD_MESSAGE = "Undergraduate course - can't count as a university elective";
const ALREADY_COUNTED_MESSAGE = "Already counted";

export function evaluate(
  plan: Plan,
  planCourses: PlanCourse[],
  catalogue: Catalogue,
): EvaluateResult {
  const groups = catalogue.groups;
  const groupEarned = new Map<string, number>(groups.map((g) => [g.id, 0]));
  const countAlready = new Map<string, number>();
  let totalEarned = 0;
  const warnings: string[] = [];

  // Walk order for allocation and pathway auto-detect: semester order, then
  // added order within a semester (9.1, 9.2).
  const walkOrder = [...planCourses].sort((a, b) =>
    a.semesterIndex !== b.semesterIndex
      ? a.semesterIndex - b.semesterIndex
      : a.addedOrder - b.addedOrder,
  );

  // --- 9.2 pathway auto-detect ---
  const pathwayGroups = groups.filter((g): g is RequirementGroup & { pathway: "A" | "B" } =>
    g.pathway != null,
  );
  const pathwaysPresent = new Set<"A" | "B">();
  for (const pc of planCourses) {
    const g = pathwayGroups.find((pg) => pg.pathwayMarkers.includes(pc.courseCode));
    if (g) pathwaysPresent.add(g.pathway);
  }
  let winnerPathway: "A" | "B" | null = null;
  let pathwayConflict = false;
  if (pathwaysPresent.size >= 2) {
    pathwayConflict = true;
    const earliest = walkOrder.find((pc) =>
      pathwayGroups.some((pg) => pg.pathwayMarkers.includes(pc.courseCode)),
    );
    winnerPathway =
      pathwayGroups.find((pg) => pg.pathwayMarkers.includes(earliest!.courseCode))!.pathway;
    warnings.push(PATHWAY_CONFLICT_MESSAGE);
  } else if (pathwaysPresent.size === 1) {
    winnerPathway = [...pathwaysPresent][0]!;
  }
  const loserPathway: "A" | "B" | null =
    pathwayConflict && winnerPathway ? (winnerPathway === "A" ? "B" : "A") : null;

  // Groups usable for placement this plan: exclude the losing pathway's
  // groups entirely (they're "not in use" once the conflict is resolved).
  const candidateGroups = groups.filter((g) => !(g.pathway && g.pathway === loserPathway));

  const resultByPlanCourseId = new Map<string, CourseResult>();

  for (const pc of walkOrder) {
    const messages: string[] = [];
    let status: CourseStatus = "counts";
    let groupName: string | undefined;

    const entries = catalogue.courses[pc.courseCode];
    const isKnown = !!entries && entries.length > 0;
    const effectiveUnverified = pc.unverified || !isKnown;

    let level: number;
    let units: number;
    let repeatableTimes: number;
    if (effectiveUnverified) {
      level = pc.level;
      units = pc.units;
      repeatableTimes = 1;
    } else {
      // Prefer this slot's calendar-year snapshot for level/units/repeat
      // info too, falling back to the latest year on record.
      const { year: calYear } = semesterCalendar(plan, pc.semesterIndex);
      const { entry } = catalogueEntryForYear(entries!, calYear);
      level = entry.level;
      units = entry.units;
      repeatableTimes = entry.repeatableTimes;
    }

    // Forced zero-credit: this course belongs to the pathway that lost.
    if (
      loserPathway &&
      pathwayGroups.some(
        (pg) => pg.pathway === loserPathway && groupAccepts(pg, pc.courseCode, level),
      )
    ) {
      status = "zero-credit";
      messages.push(PATHWAY_CONFLICT_MESSAGE);
      if (effectiveUnverified) messages.push(UNVERIFIED_MESSAGE);
      resultByPlanCourseId.set(pc.id, { planCourseId: pc.id, status, messages });
      continue;
    }

    let placed = false;

    if (effectiveUnverified) {
      // 9.1: unverified typed codes allocate by level only, into a
      // university-elective-style (filter) group if there's room.
      if (level < 6000) {
        status = "zero-credit";
        messages.push(UNDERGRAD_MESSAGE);
      } else if ((countAlready.get(pc.courseCode) ?? 0) >= repeatableTimes) {
        status = "zero-credit";
        messages.push(ALREADY_COUNTED_MESSAGE);
      } else if (totalEarned >= catalogue.program.totalUnits) {
        status = "zero-credit";
        messages.push(`Degree already complete at ${catalogue.program.totalUnits} units`);
      } else {
        const candidates = candidateGroups
          .filter((g) => g.kind === "filter")
          .filter((g) => groupAccepts(g, pc.courseCode, level))
          .sort((a, b) => a.position - b.position);
        const withRoom = candidates.find((g) => (groupEarned.get(g.id) ?? 0) < g.unitsRequired);
        if (withRoom) {
          groupEarned.set(withRoom.id, (groupEarned.get(withRoom.id) ?? 0) + units);
          totalEarned += units;
          countAlready.set(pc.courseCode, (countAlready.get(pc.courseCode) ?? 0) + 1);
          status = "unknown";
          groupName = withRoom.name;
          placed = true;
        } else if (candidates.length > 0) {
          status = "zero-credit";
          messages.push(`No room: ${candidates[0]!.name} already complete`);
        } else {
          status = "zero-credit";
          messages.push("No matching requirement group for this course");
        }
      }
      messages.push(UNVERIFIED_MESSAGE);
    } else {
      const isNamedAnywhere = groups.some(
        (g) => g.kind === "list" && g.courseCodes.includes(pc.courseCode),
      );
      if (level < 6000 && !isNamedAnywhere) {
        status = "zero-credit";
        messages.push(UNDERGRAD_MESSAGE);
      } else if ((countAlready.get(pc.courseCode) ?? 0) >= repeatableTimes) {
        status = "zero-credit";
        messages.push(ALREADY_COUNTED_MESSAGE);
      } else if (totalEarned >= catalogue.program.totalUnits) {
        status = "zero-credit";
        messages.push(`Degree already complete at ${catalogue.program.totalUnits} units`);
      } else {
        const candidates = candidateGroups
          .filter((g) => groupAccepts(g, pc.courseCode, level))
          .sort((a, b) => a.position - b.position);
        const withRoom = candidates.find((g) => (groupEarned.get(g.id) ?? 0) < g.unitsRequired);
        if (withRoom) {
          groupEarned.set(withRoom.id, (groupEarned.get(withRoom.id) ?? 0) + units);
          totalEarned += units;
          countAlready.set(pc.courseCode, (countAlready.get(pc.courseCode) ?? 0) + 1);
          status = "counts";
          groupName = withRoom.name;
          placed = true;
        } else if (candidates.length > 0) {
          status = "zero-credit";
          messages.push(`No room: ${candidates[0]!.name} already complete`);
        } else {
          status = "zero-credit";
          messages.push("No matching requirement group for this course");
        }
      }
    }

    // --- 9.3 timing checks: future/current semesters only, and only for
    // courses we actually have catalogue data for. ---
    const semStatus = semesterStatus(plan, pc.semesterIndex);
    if (semStatus !== "completed" && !effectiveUnverified) {
      const { year: calYear, semester: semNum } = semesterCalendar(plan, pc.semesterIndex);
      const { entry, fallbackUsed } = catalogueEntryForYear(entries!, calYear);

      if (!entry.offeringKnown) {
        status = worse(status, "unknown");
        messages.push("Offering not published yet");
      } else {
        const offered = semNum === 1 ? entry.offeredS1 : entry.offeredS2;
        if (!offered) {
          status = worse(status, "warn");
          messages.push(`Not offered in Semester ${semNum} ${calYear}`);
        }
      }
      if (fallbackUsed) {
        messages.push(`based on ${entry.year} offering`);
      }

      if (entry.prereqExpr) {
        const doneCodes = new Set(
          planCourses.filter((p) => p.semesterIndex < pc.semesterIndex).map((p) => p.courseCode),
        );
        const missing = missingPrereqCodes(entry.prereqExpr, doneCodes);
        if (missing.length > 0) {
          status = worse(status, "warn");
          messages.push(`Needs ${missing.join(", ")} first`);
        }
      } else if (entry.prereqText) {
        status = worse(status, "unknown");
        messages.push(`Check P&C: ${entry.prereqText}`);
      }
    }

    const result: CourseResult = { planCourseId: pc.id, status, messages };
    if (placed && groupName) result.groupName = groupName;
    resultByPlanCourseId.set(pc.id, result);
  }

  const groupResults: GroupResult[] = groups.map((g) => ({
    name: g.name,
    required: g.unitsRequired,
    earned: groupEarned.get(g.id) ?? 0,
  }));

  // Output in the original planCourses order (evaluation order is internal).
  const courses = planCourses.map((pc) => resultByPlanCourseId.get(pc.id)!);

  return {
    groups: groupResults,
    totalEarned,
    totalRequired: catalogue.program.totalUnits,
    courses,
    warnings,
  };
}
