// Hand-written override for MMLCV's project pathway (epic.md 7.3), which the
// parser deliberately leaves unparsed (see parse-program.ts and
// updates/002.md discrepancy #3). Read live 2026-09-24 across all three
// program years (2025/2026/2027) — wording is identical in each.
//
// Source: https://programsandcourses.anu.edu.au/2025/program/MMLCV
//         https://programsandcourses.anu.edu.au/2026/program/MMLCV
//         https://programsandcourses.anu.edu.au/2027/program/MMLCV
// Exact sentence (all three years): "Complete a project pathway consisting
// of either: Pathway A: COMP6442 Software Construction (6 units); AND 12
// units from completion of a research project or industry internship from
// the following list: COMP8715 Advanced Computing Team Project, which must
// be completed twice, in consecutive semesters (6+6 units) / COMP8830
// Computing Internship (12 units); AND 12 units from completion of further
// 6000, 7000 or 8000 level courses from the subject area(s) COMP or ENGN. OR
// Pathway B: COMP6445 Computing Research Methods (6 units); AND COMP8800
// Advanced Computing Research Project, which must be taken twice, in
// consecutive semesters (12+12 units)."
//
// epic.md 7.4 was corrected 2026-09-24: the pathway is 30 units total (not
// an earlier draft's 24) — 96 = 6 (core) + 6 (professional practice) + 24
// (MLCV core) + 18 (electives) + 30 (this pathway) + 12 (university
// electives), matching both epic.md 7.3's own breakdown and the real page's
// stated total.
import type { ProgramJson, RequirementGroupJson } from "../../scripts/scrape/types.ts";

const PATHWAY_A_MARKERS = ["COMP6442", "COMP8715", "COMP8830"];
const PATHWAY_B_MARKERS = ["COMP6445", "COMP8800"];

// The parser's electives group is matched by its course set (not name) so
// this stays correct even if parse-program.ts's naming changes later.
const ELECTIVES_COURSE_SET = [
  "COMP6261",
  "COMP6262",
  "COMP6320",
  "COMP6490",
  "COMP6528",
  "COMP6670",
  "COMP8535",
  "COMP8536",
  "COMP8539",
  "COMP8600",
  "COMP8610",
  "COMP8620",
  "COMP8650",
  "COMP8691",
  "ENGN6627",
];

function pathwayGroups(): RequirementGroupJson[] {
  return [
    {
      position: 0,
      name: "Project pathway A: software construction",
      kind: "list",
      unitsRequired: 6,
      courses: ["COMP6442"],
      pathway: "A",
      pathwayMarkers: PATHWAY_A_MARKERS,
    },
    {
      position: 0,
      name: "Project pathway A: research project or industry internship",
      kind: "list",
      unitsRequired: 12,
      courses: ["COMP8715", "COMP8830"],
      pathway: "A",
      pathwayMarkers: PATHWAY_A_MARKERS,
    },
    {
      position: 0,
      name: "Project pathway A: further COMP/ENGN courses",
      kind: "filter",
      unitsRequired: 12,
      filterSubjects: ["COMP", "ENGN"],
      filterMinLevel: 6000,
      pathway: "A",
      pathwayMarkers: PATHWAY_A_MARKERS,
    },
    {
      position: 0,
      name: "Project pathway B: computing research methods",
      kind: "list",
      unitsRequired: 6,
      courses: ["COMP6445"],
      pathway: "B",
      pathwayMarkers: PATHWAY_B_MARKERS,
    },
    {
      position: 0,
      name: "Project pathway B: advanced computing research project",
      kind: "list",
      unitsRequired: 24,
      courses: ["COMP8800"],
      pathway: "B",
      pathwayMarkers: PATHWAY_B_MARKERS,
    },
  ];
}

/**
 * Inserts the pathway A/B groups right after the MLCV electives list group
 * and before the university-electives filter group, matching epic.md 9.1's
 * evaluation order (core -> professional practice -> program course list ->
 * program electives -> project pathway groups -> university electives), and
 * renumbers every group's `position` to match the new document order.
 */
export function applyMmlcvOverrides(program: ProgramJson): ProgramJson {
  const electivesIdx = program.groups.findIndex(
    (g) =>
      g.kind === "list" &&
      g.courses?.length === ELECTIVES_COURSE_SET.length &&
      ELECTIVES_COURSE_SET.every((c) => g.courses?.includes(c)),
  );
  if (electivesIdx === -1) {
    return {
      ...program,
      parseWarnings: [
        ...program.parseWarnings,
        "MMLCV override: could not find the electives list group to anchor the project pathway insertion — pathway groups NOT applied, check parse-program.ts output shape.",
      ],
    };
  }
  const insertAt = electivesIdx + 1;
  const merged = [
    ...program.groups.slice(0, insertAt),
    ...pathwayGroups(),
    ...program.groups.slice(insertAt),
  ].map((g, idx) => ({ ...g, position: idx }));
  return { ...program, groups: merged };
}
