// Catalogue loader and query helpers (epic.md section 8, 15).
//
// The catalogue tables (programs, requirement_groups, group_courses,
// courses) hold no state of their own — they are truncated and reloaded from
// the committed `data/catalogue/*.json` snapshot inside one transaction,
// every time the server boots. Plan tables are never touched here.
//
// The scraper (scripts/scrape/index.ts) already applies every
// data/overrides/*.ts override before writing data/catalogue/*.json (see
// applyMmlcvOverrides/applyVcompOverrides/applyCourseOverrides/
// applySpecialisationOverrides calls in main()) — the JSON snapshot is
// already the corrected data. This loader reads only data/catalogue/*.json;
// it does not re-read data/overrides/ at boot.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { courses, groupCourses, programs, requirementGroups } from "./schema";
import type {
  Catalogue,
  CatalogueCourse,
  CatalogueProgram,
  RequirementGroup,
} from "./checker-types";
import type { CourseJson, ProgramJson } from "../../scripts/scrape/types";

// Resolved against process.cwd(), which is the repo root in every context
// this loader runs in: `pnpm dev` (astro dev), the built server invoked as
// `node ./dist/server/entry.mjs` (spec/global-setup.ts spawns it without
// changing cwd, and Docker's CMD runs it from WORKDIR /app) — same
// convention src/lib/db.ts already uses for "./drizzle".
function readCatalogueJson<T>(relativePath: string): T {
  const path = join(process.cwd(), relativePath);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// Specialisation display names (e.g. "ARTIF-SPEC" -> "Artificial
// Intelligence") live only in data/catalogue/programs.json's
// `specialisations` field (epic.md 15 adds no DB table for them — only
// `requirement_groups.specialisation` and `plans.specialisation`, both plain
// codes). Cached in memory at boot for the start form (task 006); never
// persisted, so a restart re-derives it from the same JSON the DB reloads
// from.
type SpecialisationOption = { code: string; name: string };
const specialisationCache = new Map<string, SpecialisationOption[]>();

function specialisationCacheKey(programCode: string, year: number): string {
  return `${programCode}:${year}`;
}

/** Runs at server boot (imported once from src/lib/db.ts): truncates every
 * catalogue table and reloads it from data/catalogue/*.json, inside one
 * transaction so the app never sees a half-loaded catalogue. Plan tables
 * (plans, plan_courses) are untouched. */
export function loadCatalogue(): void {
  const programsJson = readCatalogueJson<ProgramJson[]>("data/catalogue/programs.json");
  const coursesJson = readCatalogueJson<CourseJson[]>("data/catalogue/courses.json");

  specialisationCache.clear();
  for (const p of programsJson) {
    specialisationCache.set(specialisationCacheKey(p.code, p.year), p.specialisations ?? []);
  }

  db.transaction((tx) => {
    // Children first (FK-safe), catalogue tables only.
    tx.delete(groupCourses).run();
    tx.delete(requirementGroups).run();
    tx.delete(programs).run();
    tx.delete(courses).run();

    for (const p of programsJson) {
      tx.insert(programs)
        .values({
          code: p.code,
          year: p.year,
          name: p.name,
          totalUnits: p.totalUnits,
          semesters: p.semesters,
        })
        .run();

      for (const g of p.groups) {
        const inserted = tx
          .insert(requirementGroups)
          .values({
            programCode: p.code,
            year: p.year,
            position: g.position,
            name: g.name,
            kind: g.kind,
            unitsRequired: g.unitsRequired,
            filterSubjects: g.filterSubjects ?? null,
            filterMinLevel: g.filterMinLevel ?? null,
            pathway: g.pathway ?? null,
            specialisation: g.specialisation ?? null,
            pathwayMarkers: g.pathwayMarkers ?? null,
          })
          .run();
        const groupId = Number(inserted.lastInsertRowid);

        for (const code of g.courses ?? []) {
          tx.insert(groupCourses).values({ groupId, courseCode: code }).run();
        }
      }
    }

    for (const c of coursesJson) {
      tx.insert(courses)
        .values({
          code: c.code,
          year: c.year,
          title: c.title,
          units: c.units,
          level: c.level,
          offeredS1: c.offeredS1,
          offeredS2: c.offeredS2,
          offeringKnown: c.offeringKnown,
          prereqText: c.prereqText,
          // scripts/scrape/types.ts's PrereqExpr and checker-types.ts's are
          // now structurally identical trees (epic.md 18.3) — no reshaping
          // needed, just pass it through.
          prereqExpr: c.prereqExpr,
          incompatible: c.incompatible,
          repeatableTimes: c.repeatableTimes,
        })
        .run();
    }
  });
}

/** A program-year's known specialisation choices, for the start form (task
 * 006). Empty for a program with no specialisation slot (e.g. MMLCV), or an
 * unknown program-year. */
export function getSpecialisationOptions(
  programCode: string,
  year: number,
): SpecialisationOption[] {
  return specialisationCache.get(specialisationCacheKey(programCode, year)) ?? [];
}

/** The catalogue row for one program-year, or null if unknown. */
export function getProgram(programCode: string, year: number): CatalogueProgram | null {
  const row = db
    .select()
    .from(programs)
    .where(and(eq(programs.code, programCode), eq(programs.year, year)))
    .get();
  if (!row) return null;
  return { code: row.code, year: row.year, name: row.name, totalUnits: row.totalUnits, semesters: row.semesters };
}

function courseRowToCatalogueCourse(row: typeof courses.$inferSelect): CatalogueCourse {
  return {
    code: row.code,
    year: row.year,
    title: row.title,
    units: row.units,
    level: row.level,
    offeredS1: row.offeredS1,
    offeredS2: row.offeredS2,
    offeringKnown: row.offeringKnown,
    prereqText: row.prereqText,
    prereqExpr: (row.prereqExpr as CatalogueCourse["prereqExpr"]) ?? null,
    repeatableTimes: row.repeatableTimes,
  };
}

/** Looks up a course code across every catalogue year on record (any
 * program), for addCourse's "does this code exist at all" check (epic.md
 * section 8: a code the checker can find is verified; anything else is
 * unverified regardless of which program it's being added to). */
export function findCourseEntries(code: string): CatalogueCourse[] {
  const rows = db.select().from(courses).where(eq(courses.code, code)).all();
  return rows.map(courseRowToCatalogueCourse);
}

/** Builds the checker's Catalogue input for one program-year, restricted to
 * the groups the checker should actually evaluate this plan against: every
 * group with no specialisation, plus (if given) the groups tagged with the
 * plan's chosen specialisation (epic.md 15 — the loader's job, the checker
 * itself is unchanged). Returns null if the program-year is unknown. */
export function getCatalogueForProgram(
  programCode: string,
  year: number,
  specialisation: string | null,
): Catalogue | null {
  const program = getProgram(programCode, year);
  if (!program) return null;

  const groupRows = db
    .select()
    .from(requirementGroups)
    .where(and(eq(requirementGroups.programCode, programCode), eq(requirementGroups.year, year)))
    .all();

  const relevant = groupRows.filter(
    (g) => g.specialisation == null || g.specialisation === specialisation,
  );

  const groups: RequirementGroup[] = relevant.map((g) => {
    const courseCodes = db
      .select()
      .from(groupCourses)
      .where(eq(groupCourses.groupId, g.id))
      .all()
      .map((gc) => gc.courseCode);
    return {
      id: String(g.id),
      position: g.position,
      name: g.name,
      kind: g.kind,
      unitsRequired: g.unitsRequired,
      courseCodes,
      filterSubjects: g.filterSubjects,
      filterMinLevel: g.filterMinLevel,
      pathway: (g.pathway as "A" | "B" | null) ?? null,
      pathwayMarkers: g.pathwayMarkers ?? [],
    };
  });

  // Every course code any relevant group could name, plus (defensively)
  // every code on record — small catalogues, and the checker only reads
  // codes it's asked about, so there's no correctness reason to filter this
  // further.
  const allCourseRows = db.select().from(courses).all();
  const courseMap: Record<string, CatalogueCourse[]> = {};
  for (const row of allCourseRows) {
    (courseMap[row.code] ??= []).push(courseRowToCatalogueCourse(row));
  }

  return { program, groups, courses: courseMap };
}

export type { SpecialisationOption };

// Reload at module init, after every declaration above exists; db.ts must not
// import this file, or the cycle can hit specialisationCache before it's set.
loadCatalogue();
