import { JSDOM } from "jsdom";
import type { ProgramJson, RequirementGroupJson } from "./types.ts";

// A single course line directly in a group header, e.g.
// "6 units COMP6710 Structured Programming".
const DIRECT_COURSE_RE = /^([\d, \s]*\d+)\s*units?\s+([A-Z]{4}\d{4})\s+(.+)$/i;

// A group header that introduces a list of courses given as separate
// paragraphs below it, e.g. "6 units from completion of a professional
// practice course from the following list:" or "A further 18 units from
// completion of ... courses in the following list:". Not anchored at the
// very start of the line — some headers lead with prose ("A further ...")
// before the units count.
const LIST_HEADER_TAIL_RE = /(?:in|from)\s+the\s+following\s+list:?\s*$/i;
const LIST_HEADER_UNITS_RE = /(\d+)\s*units?\s+(?:from\s+)?/i;

// A single "CODE Title (N units)" course line under a list header.
const LIST_ITEM_RE = /^([A-Z]{4}\d{4})\s+(.+?)\s*\((\d+)(?:\+\d+)?\s*units?\)\.?$/i;

// "N units of [Postgraduate] University electives." — the one filter group
// the epic's programs use (epic.md 9.1: any subject, level >= 6000).
const UNI_ELECTIVE_RE = /^(\d+)\s*units?\s+of\s+(?:postgraduate\s+)?university\s+electives?\.?$/i;

// Markers of the project-pathway "Either / Or" block (epic.md 7.3): a
// hand-written override, not this parser, encodes the pathway. We recognise
// the block so we can skip it with one clear warning instead of either
// mis-parsing it as a plain list or spamming a warning per line.
const PATHWAY_START_RE = /^either:?$/i;
const PATHWAY_OR_RE = /^or$/i;

/**
 * Parse a program page
 * (`https://programsandcourses.anu.edu.au/<year>/program/<code>`) into the
 * catalogue JSON shape. Pure — no network.
 *
 * The requirements section is semi-structured prose (epic.md 7.3), not a
 * table, so this only turns the parts it can extract with confidence into
 * `list`/`filter` groups: direct single-course lines, "N units from the
 * following list:" blocks, and the university-electives filter line. A
 * project-pathway "Either/Or" block (and anything else it doesn't
 * recognise) is left out of `groups` and recorded in `parseWarnings`
 * instead — those are exactly the cases epic.md 7.3 says need a
 * hand-written `data/overrides/<CODE>.ts` to patch in.
 */
export function parseProgram(html: string, code: string, year: number): ProgramJson {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const parseWarnings: string[] = [];

  const name = doc.querySelector(".intro__degree-title__component")?.textContent?.trim();
  if (!name) parseWarnings.push("program name not found");

  const totalUnits = parseTotalUnits(doc);
  if (totalUnits === null) parseWarnings.push("total units (Minimum) not found");

  const semesters = parseSemesters(doc);
  if (semesters === null) parseWarnings.push("program length not found");

  const { groups, warnings } = parseRequirementGroups(doc);
  parseWarnings.push(...warnings);

  return {
    code,
    year,
    name: name ?? code,
    totalUnits: totalUnits ?? 0,
    semesters: semesters ?? 0,
    groups,
    parseWarnings,
  };
}

function parseTotalUnits(doc: Document): number | null {
  for (const li of doc.querySelectorAll(".degree-summary__requirements-units")) {
    const match = li.textContent?.match(/(\d+)\s*units?/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function parseSemesters(doc: Document): number | null {
  const li = doc.querySelector(".degree-summary__requirements-length");
  const match = li?.textContent?.match(/(\d+)\s*years?/i);
  if (!match) return null;
  // epic.md D13: semester count = program duration (years) × 2. Do not
  // hard-code 4 — read the duration from the page.
  return Number(match[1]) * 2;
}

function parseRequirementGroups(doc: Document): {
  groups: RequirementGroupJson[];
  warnings: string[];
} {
  const heading = doc.querySelector("#program-requirements");
  if (!heading) {
    return { groups: [], warnings: ["Program Requirements section not found"] };
  }

  const paragraphs: HTMLParagraphElement[] = [];
  for (
    let el = heading.nextElementSibling;
    el && el.tagName !== "H2";
    el = el.nextElementSibling
  ) {
    if (el.tagName === "P") paragraphs.push(el as HTMLParagraphElement);
  }

  const groups: RequirementGroupJson[] = [];
  const warnings: string[] = [];
  let pathwayWarned = false;
  let i = 0;

  while (i < paragraphs.length) {
    const p = paragraphs[i];
    const text = normalise(p.textContent ?? "");

    if (text === "") {
      i++;
      continue;
    }

    // Global program-level constraints, not a requirement group of their
    // own — noted, not silently dropped, but out of scope (epic.md
    // section 5: the "24 units at 8000 level" check was not selected).
    if (/requires the completion of/i.test(text) || /must come from completion of/i.test(text)) {
      if (/8000-level/i.test(text)) {
        warnings.push(`out of scope by design (epic.md section 5): "${text}"`);
      }
      i++;
      continue;
    }

    if (PATHWAY_START_RE.test(text) || PATHWAY_OR_RE.test(text)) {
      if (!pathwayWarned) {
        warnings.push(
          "project pathway (Either/Or block) not parsed — needs a hand-written data/overrides/<CODE>.ts (epic.md 7.3)",
        );
        pathwayWarned = true;
      }
      i++;
      continue;
    }

    const directMatch = text.match(DIRECT_COURSE_RE);
    if (directMatch) {
      const [, unitsStr, courseCode, name] = directMatch;
      groups.push({
        position: groups.length,
        name: name.trim(),
        kind: "list",
        unitsRequired: Number(unitsStr.replace(/\D/g, "")),
        courses: [courseCode],
      });
      i++;
      continue;
    }

    const uniElectiveMatch = text.match(UNI_ELECTIVE_RE);
    if (uniElectiveMatch) {
      groups.push({
        position: groups.length,
        name: "University electives",
        kind: "filter",
        unitsRequired: Number(uniElectiveMatch[1]),
        filterSubjects: null,
        filterMinLevel: 6000,
      });
      i++;
      continue;
    }

    const listHeaderMatch =
      LIST_HEADER_TAIL_RE.test(text) && text.match(LIST_HEADER_UNITS_RE);
    if (listHeaderMatch) {
      const unitsStr = listHeaderMatch[1];
      const label = text
        .slice(listHeaderMatch.index! + listHeaderMatch[0].length)
        .replace(LIST_HEADER_TAIL_RE, "")
        .trim();
      const courses: string[] = [];
      let j = i + 1;
      while (j < paragraphs.length) {
        const itemText = normalise(paragraphs[j].textContent ?? "");
        if (itemText === "") break;
        const itemMatch = itemText.match(LIST_ITEM_RE);
        if (!itemMatch) break;
        courses.push(itemMatch[1]);
        j++;
      }
      if (courses.length > 0) {
        groups.push({
          position: groups.length,
          name: cleanListName(label),
          kind: "list",
          unitsRequired: Number(unitsStr.replace(/\D/g, "")),
          courses,
        });
        i = j;
        continue;
      }
      // Header matched but no course lines followed it — don't invent an
      // empty group, record it and move on.
      warnings.push(`requirement list header with no parsed course lines: "${text}"`);
      i++;
      continue;
    }

    // Anything else (admission-style prose inside the section, a line this
    // parser doesn't recognise, etc): never guess — record and continue.
    warnings.push(`unrecognised requirement line: "${text}"`);
    i++;
  }

  return { groups, warnings };
}

function normalise(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function cleanListName(label: string): string {
  const cleaned = label
    .replace(/^from\s+completion\s+of\s*/i, "")
    .replace(/^completion\s+of\s*/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Requirement";
}
