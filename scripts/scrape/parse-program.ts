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

// A single course line under a list header: "CODE Title (N units)." on
// 2026/2027-era pages, but 2025-era pages for the same programs (MCOMP,
// VCOMP) drop the trailing "(N units)" entirely and sometimes put a dash
// after the code ("COMP6250 - Professional Practice: ..."). The units
// annotation was never read into the output anyway (the group's own
// unitsRequired, from the header line, is what's stored) so it's just an
// optional trailing anchor here, not a required one.
const LIST_ITEM_RE = /^([A-Z]{4}\d{4})\s*(?:-\s*)?(.+?)\s*(?:\((\d+)(?:\+\d+)?\s*units?\))?\.?$/i;

// "N units of [Postgraduate] University electives." — the one filter group
// the epic's programs use (epic.md 9.1: any subject, level >= 6000).
const UNI_ELECTIVE_RE = /^(\d+)\s*units?\s+of\s+(?:postgraduate\s+)?university\s+electives?\.?$/i;

// MCOMP/VCOMP's own phrasing for the same "general elective" bucket, found
// on their 2025/2026/2027 pages: "6 units from completion of elective
// courses offered by ANU." Unlike the MMLCV phrasing above, these pages
// don't state a postgraduate-only floor for this specific line — recorded
// as filterMinLevel null (no invented floor). This doesn't relax the
// zero-credit rule in practice: checker.ts's undergraduate check (epic.md
// 9.1 reason 1) fires whenever a sub-6000 course isn't named in any `list`
// group, regardless of what floor a `filter` group declares.
const ELECTIVE_COURSES_RE =
  /^(\d+)\s*units?\s+from\s+completion\s+of\s+elective\s+courses\s+offered\s+by\s+ANU\.?\s*$/i;

// "N units from completion of the following compulsory courses:" (MCOMP,
// VCOMP) and "N units from the completion of one of the following
// courses:" (VCOMP professional practice) — two more list-header phrasings
// beyond the "in/from the following list:" one above, found reading the
// MCOMP/VCOMP 2025/2026/2027 pages (task 003). Same course-list gathering
// as the generic list header, just a different lead-in sentence.
const COMPULSORY_HEADER_RE =
  /^(\d+)\s*units?\s+from\s+(?:the\s+)?completion\s+of\s+the\s+following\s+compulsory\s+courses:?\s*$/i;
// Covers "N units from the completion of one of the following courses:"
// (VCOMP professional practice) and MCOMP 2025's shorter "N units from one
// of the following <adjective> courses:" (e.g. "foundational", "project") —
// group 2 captures the adjective, if any, for a nicer group name.
const CHOICE_HEADER_RE =
  /^(\d+)\s*units?\s+from\s+(?:the\s+)?(?:completion\s+of\s+)?one\s+of\s+the\s+following\s+([a-z]*)\s*courses:?\s*$/i;

// "N units from completion of further 6000, 7000 or 8000 level courses from
// the following subject areas:" (MCOMP, subject codes as separate lines
// below) / "... from the subject area COMP Computer Science or ENGN
// Engineering" (VCOMP, subjects named inline). A `filter` group, not a
// `list` one — read on MCOMP/VCOMP 2025/2026/2027 pages (task 003).
const FILTER_SUBJECT_MULTILINE_RE =
  /^(\d+)\s*units?\s+from\s+completion\s+of\s+further\s+(\d{4}(?:\s*,\s*\d{4})*(?:\s*or\s*\d{4})?)\s*level\s+courses\s+from\s+the\s+following\s+subject\s+areas:?\s*$/i;
const FILTER_SUBJECT_INLINE_RE =
  /^(\d+)\s*units?\s+from\s+completion\s+of\s+further\s+(\d{4}(?:\s*,\s*\d{4})*(?:\s*or\s*\d{4})?)\s*level\s+courses\s+from\s+the\s+subject\s+areas?\s+(.+)$/i;
// A "CODE Name" line under FILTER_SUBJECT_MULTILINE_RE, e.g. "COMP Computer
// Science" / "ENGN Engineering" — an all-caps subject code (no digits,
// unlike LIST_ITEM_RE) followed by a capitalised name.
const SUBJECT_LINE_RE = /^([A-Z]{2,6})\s+[A-Z][a-z].*$/;
// Same subject-code shape, but matched inline within a sentence (used to
// pull codes out of FILTER_SUBJECT_INLINE_RE's trailing capture).
const SUBJECT_INLINE_RE = /\b([A-Z]{2,6})\b(?=\s+[A-Z][a-z])/g;

// Administrative footnotes that state no requirement-group data of their
// own (GPA/transfer/supervisor-approval/double-counting rules, and the
// "The N units must consist of:" lead-in some programs repeat right after
// the intro sentence already skipped above) — never guessed at, but also
// not worth a parseWarning since there is nothing to extract.
const ADMIN_NOTE_RE =
  /^the\s+\d+\s+units\s+must\s+consist\s+of:?$|gpa\s+of\s+\d|automatically\s+transferred|approval\s+of\s+an\s+identified\s+supervisor|may\s+not\s+be\s+double\s+counted/i;

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

  // Gather "CODE Title (N units)." lines directly below a list header,
  // stopping at the first blank line or non-matching paragraph. Shared by
  // every "N units from/in the following ...:" phrasing below.
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

  // Gather "CODE Name" subject-area lines directly below a multiline
  // filter-subject header (e.g. "COMP Computer Science" / "ENGN
  // Engineering"), stopping at the first blank or non-matching paragraph.
  function gatherSubjectLines(startIndex: number): { subjects: string[]; nextIndex: number } {
    const subjects: string[] = [];
    let j = startIndex;
    while (j < paragraphs.length) {
      const itemText = normalise(paragraphs[j].textContent ?? "");
      if (itemText === "") break;
      const itemMatch = itemText.match(SUBJECT_LINE_RE);
      if (!itemMatch) break;
      subjects.push(itemMatch[1].toUpperCase());
      j++;
    }
    return { subjects, nextIndex: j };
  }

  function minLevelFrom(levelListText: string): number {
    const nums = levelListText.match(/\d{4}/g)?.map(Number) ?? [];
    return nums.length > 0 ? Math.min(...nums) : 0;
  }

  while (i < paragraphs.length) {
    const p = paragraphs[i];
    const text = normalise(p.textContent ?? "");

    if (text === "" || /^[\s.]*$/.test(text)) {
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

    // Administrative footnotes with no requirement-group data of their own
    // (GPA/transfer/supervisor-approval/double-counting rules, and the
    // repeated "The N units must consist of:" lead-in) — nothing to lose by
    // skipping silently.
    if (ADMIN_NOTE_RE.test(text)) {
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

    const electiveCoursesMatch = text.match(ELECTIVE_COURSES_RE);
    if (electiveCoursesMatch) {
      groups.push({
        position: groups.length,
        name: "University electives",
        kind: "filter",
        unitsRequired: Number(electiveCoursesMatch[1]),
        filterSubjects: null,
        filterMinLevel: null,
      });
      i++;
      continue;
    }

    const filterMultilineMatch = text.match(FILTER_SUBJECT_MULTILINE_RE);
    if (filterMultilineMatch) {
      const { subjects, nextIndex } = gatherSubjectLines(i + 1);
      if (subjects.length > 0) {
        groups.push({
          position: groups.length,
          name: `Further ${subjects.join("/")} courses`,
          kind: "filter",
          unitsRequired: Number(filterMultilineMatch[1]),
          filterSubjects: subjects,
          filterMinLevel: minLevelFrom(filterMultilineMatch[2]),
        });
        i = nextIndex;
        continue;
      }
      warnings.push(`subject-area filter header with no parsed subject lines: "${text}"`);
      i++;
      continue;
    }

    const filterInlineMatch = text.match(FILTER_SUBJECT_INLINE_RE);
    if (filterInlineMatch) {
      const subjects = [
        ...new Set(
          [...filterInlineMatch[3].matchAll(SUBJECT_INLINE_RE)].map((m) => m[1].toUpperCase()),
        ),
      ];
      if (subjects.length > 0) {
        groups.push({
          position: groups.length,
          name: `Further ${subjects.join("/")} courses`,
          kind: "filter",
          unitsRequired: Number(filterInlineMatch[1]),
          filterSubjects: subjects,
          filterMinLevel: minLevelFrom(filterInlineMatch[2]),
        });
        i++;
        continue;
      }
      warnings.push(`subject-area filter line named no subjects: "${text}"`);
      i++;
      continue;
    }

    const compulsoryMatch = text.match(COMPULSORY_HEADER_RE);
    const choiceMatch = text.match(CHOICE_HEADER_RE);
    if (compulsoryMatch || choiceMatch) {
      const unitsStr = (compulsoryMatch ?? choiceMatch)![1];
      const { courses, nextIndex } = gatherListItems(i + 1);
      if (courses.length > 0) {
        const adjective = choiceMatch?.[2]?.trim();
        groups.push({
          position: groups.length,
          name: compulsoryMatch
            ? "Compulsory courses"
            : adjective
              ? `${adjective[0]!.toUpperCase()}${adjective.slice(1)} courses`
              : "Choice of course",
          kind: "list",
          unitsRequired: Number(unitsStr),
          courses,
        });
        i = nextIndex;
        continue;
      }
      warnings.push(`requirement list header with no parsed course lines: "${text}"`);
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
      const { courses, nextIndex } = gatherListItems(i + 1);
      if (courses.length > 0) {
        groups.push({
          position: groups.length,
          name: cleanListName(label),
          kind: "list",
          unitsRequired: Number(unitsStr.replace(/\D/g, "")),
          courses,
        });
        i = nextIndex;
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
