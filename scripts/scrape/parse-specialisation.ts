import { JSDOM } from "jsdom";
import type { RequirementGroupJson } from "./types.ts";

// Parses a specialisation page
// (`https://programsandcourses.anu.edu.au/<year>/specialisation/<CODE>`),
// the pages MCOMP/VCOMP's "24 units from the completion of one of the
// following Specialisations:" line links to (epic.md 15, task 011). Pure —
// no network. Reads real wording confirmed 2026-09-24 across every
// specialisation MCOMP/VCOMP 2025/2026/2027 offer (ARTIF/CMSY/COMP/CSEC/
// DTSC/HCCM/MCHL/PCOM/SOFT-SPEC): every page states a 24-unit total plus a
// global "minimum N units 8000-level" floor (recorded as an out-of-scope
// warning, same policy as parse-program.ts's equivalent program-level
// note), then one of these shapes for the 24 units themselves:
//   - a bare course list with no header (ARTIF-SPEC 2025/2026, MCHL-SPEC
//     2025/2026) — the whole list is worth the specialisation's total units;
//   - "A minimum/maximum of N units from [completion of courses from] the
//     following list:" sub-lists (ARTIF-SPEC 2027, CMSY-SPEC, COMP-SPEC);
//   - "N units from [the/completion of the] following compulsory courses:"
//     plus one or more "N units from completion of a course/courses from
//     the following list:" blocks, "AND"-joined (CSEC-SPEC, PCOM-SPEC,
//     SOFT-SPEC);
//   - a single-sentence subject/level filter with a named course exclusion
//     that this parser cannot enforce structurally (PCOM-SPEC, SOFT-SPEC) —
//     turned into a `filter` group plus a warning about the exclusion.
// Anything else (e.g. HCCM-SPEC's bare compulsory course line with no
// stated units) is left as a warning for a hand-written
// data/overrides/specialisations.ts to patch, never guessed at.

const INTRO_RE = /^This\s+Speciali[sz]ation\s+requires\s+the\s+completion\s+of\s+(\d+)\s*units/i;

// A standalone "N units must be/come from 8000-level courses" global floor,
// stated either inside the intro sentence itself or as its own paragraph
// (both forms appear across the real pages) — out of scope by design
// (epic.md section 5), same as parse-program.ts's identical note.
const STANDALONE_8000_RE =
  /^A\s+minimum\s+of\s+\d+\s*units?\s+(?:of\s+8000[\s-]level\s+courses|must\s+come\s+from\s+(?:the\s+)?completion\s+of\s+8000[\s-]level\s+courses)\.?\s*$/i;

// "The 24 units must consist of:" / "which must consist of:" lead-ins that
// carry no group data of their own.
const ADMIN_CONSIST_RE = /^(?:the\s+\d+\s*units|which)\s+must\s+consist\s+of:?\s*$/i;

// A bare "AND" line joining two requirement blocks (CSEC-SPEC, PCOM-SPEC,
// SOFT-SPEC) — structural, not a group of its own.
const AND_LINE_RE = /^and:?$/i;

// "A minimum/maximum of N units from [completion of courses from] the
// following list:" (ARTIF-SPEC 2027 omits "completion of courses from";
// CMSY-SPEC/COMP-SPEC/CSEC-SPEC/SOFT-SPEC include it).
const MIN_MAX_LIST_RE =
  /^A\s+(minimum|maximum)\s+of\s+(\d+)\s*units?\s+from\s+(?:completion\s+of\s+courses\s+from\s+)?the\s+following\s+list:?\s*$/i;

// "N units from [the/completion of [the]] following compulsory courses:"
// (CSEC-SPEC, DTSC-SPEC, PCOM-SPEC, SOFT-SPEC — colon and "the"/"completion
// of" all optional, matching every real variant found).
const COMPULSORY_LIST_RE =
  /^(\d+)\s*units?\s+from\s+(?:the\s+)?(?:completion\s+of\s+)?(?:the\s+)?following\s+compulsory\s+courses:?\s*$/i;

// "N units from completion of a course/courses from the following list:"
// (DTSC-SPEC "courses", PCOM-SPEC "a course") — a plain elective sub-list
// with no min/max qualifier.
const GENERIC_LIST_RE =
  /^(\d+)\s*units?\s+from\s+completion\s+of\s+(?:a\s+course|courses)\s+from\s+the\s+following\s+list:?\s*$/i;

// A single-sentence subject/level filter naming an unenforceable course
// exclusion (PCOM-SPEC's "any 8000 level COMP coded course", SOFT-SPEC's "an
// 8000-level course from the subject area COMP Computing").
const FILTER_EXCLUSION_RE =
  /^(\d+)\s*units?\s+from\s+completion\s+of\s+(?:any|an)\s+8000[\s-]level\s+(?:COMP\s+coded\s+course|course\s+from\s+the\s+subject\s+area\s+COMP\s+Computing),?\s+excluding\s+(?:the\s+)?project\s+courses\s*\(([^)]*)\)\.?\s*$/i;

// A course line: "<a>CODE</a> Title" possibly with a "(N units)" suffix
// (never read — a bare-list group's unitsRequired comes from the intro, a
// sub-list's from its own min/max/compulsory header).
const LIST_ITEM_RE = /^([A-Z]{4}\d{4})\s*(?:-\s*)?(.+?)\s*(?:\((?:\d+(?:\+\d+)?)\s*units?\))?\.?$/i;

export interface SpecialisationJson {
  name: string;
  totalUnits: number;
  groups: RequirementGroupJson[];
  warnings: string[];
}

export function parseSpecialisation(html: string, code: string, year: number): SpecialisationJson {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const warnings: string[] = [];

  const name = doc.querySelector(".intro__degree-title__component")?.textContent?.trim();
  if (!name) warnings.push(`${code} ${year}: specialisation name not found`);

  const heading = doc.querySelector("#requirements");
  if (!heading) {
    return {
      name: name ?? code,
      totalUnits: 0,
      groups: [],
      warnings: [...warnings, `${code} ${year}: Requirements section not found`],
    };
  }

  const paragraphs: HTMLParagraphElement[] = [];
  for (
    let el = heading.nextElementSibling;
    el && el.tagName !== "H2";
    el = el.nextElementSibling
  ) {
    if (el.tagName === "P") paragraphs.push(el as HTMLParagraphElement);
  }

  let totalUnits = 0;
  let foundTotal = false;
  const groups: RequirementGroupJson[] = [];
  const bareCourses: string[] = [];
  let i = 0;

  function gatherListItems(startIndex: number): { courses: string[]; nextIndex: number } {
    const courses: string[] = [];
    let j = startIndex;
    while (j < paragraphs.length) {
      const itemText = normalise(paragraphs[j].textContent ?? "");
      if (itemText === "") break;
      const itemMatch = itemText.match(LIST_ITEM_RE);
      if (!itemMatch) break;
      courses.push(itemMatch[1]);
      j++;
    }
    return { courses, nextIndex: j };
  }

  while (i < paragraphs.length) {
    const text = normalise(paragraphs[i].textContent ?? "");

    if (text === "" || /^[\s.]*$/.test(text)) {
      i++;
      continue;
    }

    const introMatch = text.match(INTRO_RE);
    if (introMatch) {
      totalUnits = Number(introMatch[1]);
      foundTotal = true;
      if (/8000[\s-]level/i.test(text)) {
        warnings.push(`out of scope by design (epic.md section 5): "${text}"`);
      }
      i++;
      continue;
    }

    if (STANDALONE_8000_RE.test(text)) {
      warnings.push(`out of scope by design (epic.md section 5): "${text}"`);
      i++;
      continue;
    }

    if (ADMIN_CONSIST_RE.test(text) || AND_LINE_RE.test(text)) {
      i++;
      continue;
    }

    const minMaxMatch = text.match(MIN_MAX_LIST_RE);
    if (minMaxMatch) {
      const { courses, nextIndex } = gatherListItems(i + 1);
      if (courses.length > 0) {
        const isMin = minMaxMatch[1].toLowerCase() === "minimum";
        groups.push({
          position: groups.length,
          name: isMin ? "Required list courses" : "Optional list courses",
          kind: "list",
          unitsRequired: Number(minMaxMatch[2]),
          courses,
          specialisation: code,
        });
        i = nextIndex;
        continue;
      }
      warnings.push(`${code} ${year}: min/max list header with no parsed course lines: "${text}"`);
      i++;
      continue;
    }

    const compulsoryMatch = text.match(COMPULSORY_LIST_RE);
    if (compulsoryMatch) {
      const { courses, nextIndex } = gatherListItems(i + 1);
      if (courses.length > 0) {
        groups.push({
          position: groups.length,
          name: "Compulsory courses",
          kind: "list",
          unitsRequired: Number(compulsoryMatch[1]),
          courses,
          specialisation: code,
        });
        i = nextIndex;
        continue;
      }
      warnings.push(`${code} ${year}: compulsory header with no parsed course lines: "${text}"`);
      i++;
      continue;
    }

    const genericListMatch = text.match(GENERIC_LIST_RE);
    if (genericListMatch) {
      const { courses, nextIndex } = gatherListItems(i + 1);
      if (courses.length > 0) {
        groups.push({
          position: groups.length,
          name: "Elective courses",
          kind: "list",
          unitsRequired: Number(genericListMatch[1]),
          courses,
          specialisation: code,
        });
        i = nextIndex;
        continue;
      }
      warnings.push(`${code} ${year}: elective list header with no parsed course lines: "${text}"`);
      i++;
      continue;
    }

    const filterMatch = text.match(FILTER_EXCLUSION_RE);
    if (filterMatch) {
      groups.push({
        position: groups.length,
        name: "Further 8000-level COMP courses",
        kind: "filter",
        unitsRequired: Number(filterMatch[1]),
        filterSubjects: ["COMP"],
        filterMinLevel: 8000,
        specialisation: code,
      });
      warnings.push(
        `${code} ${year}: filter excludes specific courses (${filterMatch[2].trim()}) not enforced by a "filter" group's subject/level fields: "${text}"`,
      );
      i++;
      continue;
    }

    // A bare "<a>CODE</a> Title" line with no header of its own — either
    // part of an implicit whole-total list (ARTIF-SPEC 2025/2026, MCHL-SPEC
    // 2025/2026) or, if it has no stated units and nothing above claimed it
    // (HCCM-SPEC's compulsory COMP6390 line), a gap a hand-written override
    // must fill. Collected here and only turned into a group once the walk
    // ends, once it's clear no other header consumed the rest.
    const bareMatch = text.match(LIST_ITEM_RE);
    if (bareMatch) {
      bareCourses.push(bareMatch[1]);
      i++;
      continue;
    }

    warnings.push(`${code} ${year}: unrecognised requirement line: "${text}"`);
    i++;
  }

  if (bareCourses.length > 0) {
    if (groups.length === 0 && foundTotal) {
      // The only content is a bare list: the whole specialisation total is
      // "from the following list" (ARTIF-SPEC 2025/2026, MCHL-SPEC
      // 2025/2026's "...following list which must include:" intro).
      groups.push({
        position: groups.length,
        name: "Specialisation courses",
        kind: "list",
        unitsRequired: totalUnits,
        courses: bareCourses,
        specialisation: code,
      });
    } else {
      // Bare course line(s) alongside other, already-parsed groups (e.g.
      // HCCM-SPEC's compulsory COMP6390, which states no units of its own)
      // — never guess a unit count here. Left as a warning for
      // data/overrides/specialisations.ts.
      warnings.push(
        `${code} ${year}: bare course line(s) with no stated units, not folded into a group: ${bareCourses.join(", ")}`,
      );
    }
  }

  if (!foundTotal) {
    warnings.push(`${code} ${year}: specialisation total units not found`);
  }

  return { name: name ?? code, totalUnits, groups, warnings };
}

function normalise(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}
