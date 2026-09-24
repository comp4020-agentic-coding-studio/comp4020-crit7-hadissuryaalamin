// Hand-written overrides for specialisation pages parse-specialisation.ts
// cannot turn fully into groups (epic.md 15, task 011). Applied by the
// runner (scripts/scrape/index.ts) to parseSpecialisation's output before
// its groups are spliced into the owning program's group list. Read live
// 2026-09-24.
//
// HCCM-SPEC (2025/2026/2027 — identical wording each year, only the
// "minimum of 12" list's course set changes):
// Source: https://programsandcourses.anu.edu.au/2025/specialisation/HCCM-SPEC
//         https://programsandcourses.anu.edu.au/2026/specialisation/HCCM-SPEC
//         https://programsandcourses.anu.edu.au/2027/specialisation/HCCM-SPEC
// Exact sentences: "This specialisation requires the completion of 24 units,
// which must include a minimum of 12 units of 8000-level courses: The 24
// units must consist of: COMP6390 Human-Computer Interaction AND A minimum
// of 12 units from the following list: [...] AND A maximum of 6 units from
// completion of courses from the following list: [...]".
// The page states no unit count for the compulsory COMP6390 line itself —
// parse-specialisation.ts correctly (per "never guess") leaves it as a bare,
// ungrouped course plus a warning rather than inventing a number. COMP6390
// is a 6-unit course — not assumed, but read directly off another real ANU
// page that names it with its unit count spelled out:
// https://programsandcourses.anu.edu.au/2025/specialisation/PCOM-SPEC states
// "COMP6390 Human-Computer Interaction (6 units)". 6 is also the only value
// consistent with HCCM-SPEC's own stated total (24) and its other two
// stated blocks (12 + 6 = 18, leaving exactly 6) — corroborating, not the
// basis of, the number used here.
//
// SOFT-SPEC (2026/2027 only — 2025's specialisation of this name was
// PCOM-SPEC, a different, internally-consistent set of blocks, untouched by
// this override):
// Source: https://programsandcourses.anu.edu.au/2026/specialisation/SOFT-SPEC
//         https://programsandcourses.anu.edu.au/2027/specialisation/SOFT-SPEC
// Exact sentence: "A maximum of 12 units from completion of courses from the
// following list: COMP6240 / COMP6331 / COMP6390 / INFS8004 / INFS8205 /
// LAWS8445 / MGMT7020 / REGN8014 (6 units each)."
// SOFT-SPEC's own stated total is a fixed 24 units, and its other two stated
// blocks already total 18 (12 units compulsory + 6 units filter) — leaving
// exactly 6 units for this list, not the 12 its own "maximum of" wording
// states. Recorded here as a correction to the group parse-specialisation.ts
// already produces (kind "list", named "Optional list courses"), not
// inferred at parse time.
import type { RequirementGroupJson } from "../../scripts/scrape/types.ts";

const HCCM_COMPULSORY_WARNING_FRAGMENT =
  "bare course line(s) with no stated units, not folded into a group: COMP6390";

function hccmCompulsoryGroup(code: string): RequirementGroupJson {
  return {
    position: 0,
    name: "Compulsory courses",
    kind: "list",
    unitsRequired: 6,
    courses: ["COMP6390"],
    specialisation: code,
  };
}

/**
 * Applied to a single specialisation-year's parseSpecialisation output
 * (before splicing into the owning program) — corrects the two literal
 * inconsistencies cited above, and leaves every other specialisation/year
 * untouched.
 */
export function applySpecialisationOverrides(
  code: string,
  _year: number,
  groups: RequirementGroupJson[],
  warnings: string[],
): { groups: RequirementGroupJson[]; warnings: string[] } {
  if (code === "HCCM-SPEC") {
    const merged = [hccmCompulsoryGroup(code), ...groups].map((g, idx) => ({
      ...g,
      position: idx,
    }));
    return {
      groups: merged,
      warnings: warnings.filter((w) => !w.includes(HCCM_COMPULSORY_WARNING_FRAGMENT)),
    };
  }

  if (code === "SOFT-SPEC" && (_year === 2026 || _year === 2027)) {
    const fixed = groups.map((g) =>
      g.specialisation === code && g.name === "Optional list courses" && g.unitsRequired === 12
        ? { ...g, unitsRequired: 6 }
        : g,
    );
    return { groups: fixed, warnings };
  }

  return { groups, warnings };
}
