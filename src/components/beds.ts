// Planting Plan direction: every requirement group is a "bed" with a flat
// colour from a fixed 8-hue set, assigned deterministically by the group's
// position in the catalogue's group list, and identical everywhere that bed
// appears (pinned legend swatch, stake band on a course card, badge). This
// module is the one place that mapping is computed, so the plan page and
// CourseCard.astro never disagree about a bed's colour.
//
// Presentation-only: reads the shape of RequirementGroup (from
// ../lib/checker-types) but writes nothing back and has no DB/catalogue
// access itself — src/lib/* stays untouched.
import type { RequirementGroup } from "../lib/checker-types";

export interface Bed {
  /** One of the eight fixed hue names from the direction contract. */
  hueName: string;
  hex: string;
}

// Flat, unmodulated fields — no gradients, no tints — from the contract's
// fixed set: moss, marigold, brick, iris, plum, sage, ochre, slate. Chosen to
// sit apart from the reserved action teal (--accent) and from the red/grey/
// amber marks used for status stamps.
const BED_HUES: Bed[] = [
  { hueName: "moss", hex: "#4F6B3A" },
  { hueName: "marigold", hex: "#D98A22" },
  { hueName: "brick", hex: "#A4482F" },
  { hueName: "iris", hex: "#4C5A9E" },
  { hueName: "plum", hex: "#7A4569" },
  { hueName: "sage", hex: "#6E8B6B" },
  { hueName: "ochre", hex: "#B68B1E" },
  { hueName: "slate", hex: "#45606B" },
];

// Groups that should share one hue rather than each taking their own:
// - a project-pathway option (MMLCV): every group tagged pathway "A" is one
//   bed, every group tagged "B" is another.
// - a specialisation's own sub-groups (MCOMP/VCOMP): after the loader filters
//   to the plan's chosen specialisation, "Specialisation courses" /
//   "Required list courses" / "Optional list courses" are all that one
//   specialisation's rows, not three unrelated groups, so they share a bed.
const SPECIALISATION_CLUSTER_NAMES = new Set([
  "Specialisation courses",
  "Required list courses",
  "Optional list courses",
]);

function colourKeyFor(group: RequirementGroup): string {
  if (group.pathway) return `pathway-${group.pathway}`;
  if (SPECIALISATION_CLUSTER_NAMES.has(group.name)) return "specialisation-cluster";
  return `group-${group.id}`;
}

/** Maps every group's exact `name` (as it appears in checker output, e.g.
 * `CourseResult.groupName` / `GroupResult.name`) to its bed, in one pass over
 * the catalogue's groups (already position-ordered). Call once per page
 * render and reuse for the legend and every stake. */
export function buildBedMap(groups: RequirementGroup[]): Map<string, Bed> {
  const keyOrder: string[] = [];
  for (const group of groups) {
    const key = colourKeyFor(group);
    if (!keyOrder.includes(key)) keyOrder.push(key);
  }
  const keyToBed = new Map<string, Bed>();
  keyOrder.forEach((key, i) => {
    keyToBed.set(key, BED_HUES[i % BED_HUES.length]);
  });
  const nameToBed = new Map<string, Bed>();
  for (const group of groups) {
    nameToBed.set(group.name, keyToBed.get(colourKeyFor(group))!);
  }
  return nameToBed;
}
