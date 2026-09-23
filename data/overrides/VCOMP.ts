// Hand-written override for VCOMP's mandatory research project block, which
// the parser cannot turn into a group (a 2-paragraph "N units from
// completion of" / "<course>, which must be taken twice..." split with no
// list-header phrasing the parser recognises). Read live 2026-09-24.
//
// Source: https://programsandcourses.anu.edu.au/2025/program/7722XVCOMP
//         https://programsandcourses.anu.edu.au/2026/program/7722XVCOMP
//         https://programsandcourses.anu.edu.au/2027/program/7722XVCOMP
// Exact sentence (2026, identical in 2025/2027 except minor wording of the
// lead-in): "24 units from completion of COMP8800 Advanced Computing
// Research Project, which must be taken twice, in consecutive semesters
// (12+12 units)."
//
// The 24-unit "Specialisation" block immediately after this (Artificial
// Intelligence / Computer Systems / Cyber Security / Computational
// Foundations / Data Science / Human Centred and Creative Computing /
// Machine Learning / Software Development) is deliberately NOT overridden
// here: each specialisation names its own separate course list that is not
// present on this program page (it lives on a per-specialisation page this
// task did not fetch — out of scope per "never invent data"). It stays a
// parseWarning gap; the units-sum sanity check will show a real 24-unit
// shortfall for every VCOMP year until a later task fetches and encodes it.
import type { ProgramJson, RequirementGroupJson } from "../../scripts/scrape/types.ts";

const COMPULSORY_COURSE_SET = ["COMP6442", "COMP6445"];

function projectGroup(): RequirementGroupJson {
  return {
    position: 0,
    name: "Advanced computing research project",
    kind: "list",
    unitsRequired: 24,
    courses: ["COMP8800"],
  };
}

/**
 * Inserts the COMP8800 project group right after the 12-unit compulsory
 * courses group (COMP6442/COMP6445) and before the further-COMP/ENGN filter
 * group, matching the page's own document order (epic.md 9.1), and
 * renumbers every group's `position` to match.
 */
export function applyVcompOverrides(program: ProgramJson): ProgramJson {
  const compulsoryIdx = program.groups.findIndex(
    (g) =>
      g.kind === "list" &&
      g.courses?.length === COMPULSORY_COURSE_SET.length &&
      COMPULSORY_COURSE_SET.every((c) => g.courses?.includes(c)),
  );
  if (compulsoryIdx === -1) {
    return {
      ...program,
      parseWarnings: [
        ...program.parseWarnings,
        "VCOMP override: could not find the compulsory courses group (COMP6442/COMP6445) to anchor the COMP8800 project group insertion — override NOT applied, check parse-program.ts output shape.",
      ],
    };
  }
  const insertAt = compulsoryIdx + 1;
  const merged = [
    ...program.groups.slice(0, insertAt),
    projectGroup(),
    ...program.groups.slice(insertAt),
  ].map((g, idx) => ({ ...g, position: idx }));
  return { ...program, groups: merged };
}
