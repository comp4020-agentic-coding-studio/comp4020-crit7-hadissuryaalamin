// Scraper runner (task 003, epic.md section 7). Fetches ANU
// programsandcourses.anu.edu.au program and course pages, parses them with
// the pure parse-*.ts functions, applies hand-written overrides
// (data/overrides/), and writes data/catalogue/programs.json and
// courses.json.
//
// Usage: node scripts/scrape/index.ts [--refresh]
//   --refresh   bypass the .cache/scrape/ cache and re-fetch every page.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseCourse } from "./parse-course.ts";
import { parseProgram, SPECIALISATION_SLOT } from "./parse-program.ts";
import { parseSpecialisation } from "./parse-specialisation.ts";
import type { CourseJson, ProgramJson, RequirementGroupJson } from "./types.ts";
import { applyMmlcvOverrides } from "../../data/overrides/MMLCV.ts";
import { applyVcompOverrides } from "../../data/overrides/VCOMP.ts";
import { applyCourseOverrides } from "../../data/overrides/courses.ts";
import { applySpecialisationOverrides } from "../../data/overrides/specialisations.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36";
const REQUEST_DELAY_MS = 1000;
const CACHE_DIR = ".cache/scrape";
const REFRESH = process.argv.includes("--refresh");

const YEARS = [2025, 2026, 2027] as const;

// Program code -> URL code. MCOMP/VCOMP's year-scoped program URL only
// accepts the long search-API form (short form 302s); MMLCV accepts its own
// short code directly (verified by HTTP status probing 2026-09-24, task 003).
const PROGRAMS: { code: string; urlCode: string }[] = [
  { code: "MCOMP", urlCode: "7706XMCOMP" },
  { code: "VCOMP", urlCode: "7722XVCOMP" },
  { code: "MMLCV", urlCode: "MMLCV" },
];

// Fixed extra undergrad course list (task 003 brief) — always fetched
// regardless of what programs reference, for every year.
const EXTRA_COURSES = ["COMP1100", "COMP1110", "COMP2100", "COMP2120", "MATH1013"];

const PROGRAM_OVERRIDES: Record<string, (p: ProgramJson) => ProgramJson> = {
  MMLCV: applyMmlcvOverrides,
  VCOMP: applyVcompOverrides,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches `url` with caching under `.cache/scrape/<cacheKey>.html`. Only
 * sleeps REQUEST_DELAY_MS after a real network fetch, never on a cache hit,
 * so re-running the scraper without --refresh is fast. Returns null (never
 * throws) on a non-200 response or network error, so one dead page never
 * aborts the whole run — the caller must record this as a parseWarning
 * rather than inventing data.
 */
async function fetchCached(cacheKey: string, url: string): Promise<string | null> {
  const file = `${CACHE_DIR}/${cacheKey}.html`;
  if (!REFRESH && existsSync(file)) {
    return readFileSync(file, "utf8");
  }
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      console.warn(`FETCH FAILED (HTTP ${res.status}): ${url}`);
      await sleep(REQUEST_DELAY_MS);
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.warn(`FETCH ERROR: ${url} — ${(err as Error).message}`);
    await sleep(REQUEST_DELAY_MS);
    return null;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, html);
  await sleep(REQUEST_DELAY_MS);
  return html;
}

/**
 * Resolves a program's specialisation slot (epic.md 15, task 011): fetches
 * every specialisation the program page itself links to
 * (program.specialisations, from parseSpecialisationLinks — never a
 * hard-coded set), parses each with parseSpecialisation, applies
 * data/overrides/specialisations.ts, and splices every specialisation's
 * groups into the program's groups array at the sentinel's former position
 * (removing the sentinel), renumbering `position` to match. Every
 * specialisation's groups are kept, each still tagged with its own
 * `specialisation` code — like a pathway, a real student picks exactly one,
 * so the sanity check below treats groups sharing a `specialisation` code as
 * alternatives, not additive.
 *
 * Builds the fetch URL from the program-year's own year, never from the
 * specialisation link's href — some 2027 program pages link
 * "/specialisation/<CODE>" with the year segment missing (an ANU page bug,
 * confirmed reading MCOMP/VCOMP 2027), and following it literally would 404.
 *
 * A no-op (returns `program` unchanged) for any program with no
 * specialisation slot (e.g. MMLCV) — cheap to call unconditionally.
 */
async function resolveSpecialisations(program: ProgramJson): Promise<ProgramJson> {
  const slotIndex = program.groups.findIndex((g) => g.specialisation === SPECIALISATION_SLOT);
  if (slotIndex === -1) return program;

  const specs = program.specialisations ?? [];
  if (specs.length === 0) {
    const groups = program.groups
      .filter((_, idx) => idx !== slotIndex)
      .map((g, idx) => ({ ...g, position: idx }));
    return {
      ...program,
      groups,
      parseWarnings: [
        ...program.parseWarnings,
        "specialisation slot present but no specialisations were found on the program page — slot removed, no groups added",
      ],
    };
  }

  const specGroups: RequirementGroupJson[] = [];
  const specWarnings: string[] = [];
  for (const { code } of specs) {
    const url = `https://programsandcourses.anu.edu.au/${program.year}/specialisation/${code}`;
    const html = await fetchCached(`specialisation-${code}-${program.year}`, url);
    if (html === null) {
      specWarnings.push(`specialisation ${code} ${program.year}: FETCH FAILED, no data captured: ${url}`);
      continue;
    }
    const parsed = parseSpecialisation(html, code, program.year);
    const { groups, warnings } = applySpecialisationOverrides(
      code,
      program.year,
      parsed.groups,
      parsed.warnings,
    );
    specGroups.push(...groups);
    specWarnings.push(...warnings);
  }

  const merged = [
    ...program.groups.slice(0, slotIndex),
    ...specGroups,
    ...program.groups.slice(slotIndex + 1),
  ].map((g, idx) => ({ ...g, position: idx }));

  return {
    ...program,
    groups: merged,
    parseWarnings: [...program.parseWarnings, ...specWarnings],
  };
}

function stubProgram(code: string, year: number, reason: string): ProgramJson {
  return {
    code,
    year,
    name: code,
    totalUnits: 0,
    semesters: 0,
    groups: [],
    parseWarnings: [`FETCH FAILED, no data captured: ${reason}`],
  };
}

function stubCourse(code: string, year: number, reason: string): CourseJson {
  return {
    code,
    year,
    title: code,
    units: 0,
    level: Number(code.replace(/[^0-9]/g, "").slice(0, 1) || "0") * 1000,
    offeredS1: false,
    offeredS2: false,
    offeringKnown: false,
    prereqText: null,
    prereqExpr: null,
    incompatible: [],
    repeatableTimes: 1,
    parseWarnings: [`FETCH FAILED, no data captured: ${reason}`],
  };
}

async function main() {
  const programs: ProgramJson[] = [];
  const courseCodesByYear = new Map<number, Set<string>>(YEARS.map((y) => [y, new Set<string>()]));

  for (const prog of PROGRAMS) {
    for (const year of YEARS) {
      const url = `https://programsandcourses.anu.edu.au/${year}/program/${prog.urlCode}`;
      const html = await fetchCached(`program-${prog.code}-${year}`, url);
      let parsed: ProgramJson;
      if (html === null) {
        parsed = stubProgram(prog.code, year, url);
      } else {
        parsed = parseProgram(html, prog.code, year);
        const applyOverride = PROGRAM_OVERRIDES[prog.code];
        if (applyOverride) parsed = applyOverride(parsed);
        parsed = await resolveSpecialisations(parsed);
      }
      programs.push(parsed);
      const set = courseCodesByYear.get(year)!;
      for (const group of parsed.groups) {
        for (const code of group.courses ?? []) set.add(code);
      }
    }
  }

  for (const year of YEARS) {
    const set = courseCodesByYear.get(year)!;
    for (const code of EXTRA_COURSES) set.add(code);
  }

  const courses: CourseJson[] = [];
  for (const year of YEARS) {
    const codes = [...courseCodesByYear.get(year)!].sort();
    for (const code of codes) {
      const url = `https://programsandcourses.anu.edu.au/${year}/course/${code}`;
      const html = await fetchCached(`course-${code}-${year}`, url);
      let parsed = html === null ? stubCourse(code, year, url) : parseCourse(html, code, year);
      parsed = applyCourseOverrides(parsed);
      courses.push(parsed);
    }
  }

  programs.sort((a, b) => a.code.localeCompare(b.code) || a.year - b.year);
  courses.sort((a, b) => a.code.localeCompare(b.code) || a.year - b.year);

  mkdirSync("data/catalogue", { recursive: true });
  writeFileSync("data/catalogue/programs.json", `${JSON.stringify(programs, null, 2)}\n`);
  writeFileSync("data/catalogue/courses.json", `${JSON.stringify(courses, null, 2)}\n`);

  console.log(`Wrote ${programs.length} program-years and ${courses.length} course-years.`);

  console.log("\nSanity check (requirement groups' units vs program total, epic.md 7.2):");
  for (const p of programs) {
    // Pathway groups (epic.md 7.3/9.2) are alternatives, not additive: a
    // student completes ONE pathway, not every one a program offers, so a
    // literal sum across all of them would always overshoot the total by
    // every pathway but one. Count only the most expensive single pathway's
    // units once, alongside every non-pathway group, so this check reflects
    // what one real student's plan adds up to.
    // Specialisation groups (epic.md 15) are alternatives exactly like
    // pathway groups above: a student completes ONE specialisation, so count
    // only the most expensive single specialisation's units once.
    const nonAlternativeUnits = p.groups
      .filter((g) => !g.pathway && !g.specialisation)
      .reduce((s, g) => s + g.unitsRequired, 0);
    const unitsByPathway = new Map<string, number>();
    const unitsBySpecialisation = new Map<string, number>();
    for (const g of p.groups) {
      if (g.pathway) {
        unitsByPathway.set(g.pathway, (unitsByPathway.get(g.pathway) ?? 0) + g.unitsRequired);
      }
      if (g.specialisation) {
        unitsBySpecialisation.set(
          g.specialisation,
          (unitsBySpecialisation.get(g.specialisation) ?? 0) + g.unitsRequired,
        );
      }
    }
    const pathwayUnits = unitsByPathway.size > 0 ? Math.max(...unitsByPathway.values()) : 0;
    const specialisationUnits =
      unitsBySpecialisation.size > 0 ? Math.max(...unitsBySpecialisation.values()) : 0;
    const sum = nonAlternativeUnits + pathwayUnits + specialisationUnits;
    if (sum !== p.totalUnits) {
      console.warn(
        `  MISMATCH: ${p.code} ${p.year}: groups sum to ${sum}, program total is ${p.totalUnits} (short by ${p.totalUnits - sum})`,
      );
    } else {
      console.log(`  OK: ${p.code} ${p.year}: ${sum}/${p.totalUnits}`);
    }
    if (unitsBySpecialisation.size > 0) {
      const list = [...unitsBySpecialisation.entries()]
        .map(([code, units]) => `${code}=${units}`)
        .join(", ");
      console.log(`    specialisations: ${list}`);
    }
  }

  const totalWarnings = programs.reduce((s, p) => s + p.parseWarnings.length, 0) +
    courses.reduce((s, c) => s + c.parseWarnings.length, 0);
  console.log(`\nTotal parseWarnings across catalogue: ${totalWarnings}`);
}

main();
