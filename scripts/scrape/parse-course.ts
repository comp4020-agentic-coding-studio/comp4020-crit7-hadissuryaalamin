import { JSDOM } from "jsdom";
import { parsePrereq } from "./parse-prereq.ts";
import type { CourseJson } from "./types.ts";

const CODE_RE = /\b[A-Z]{4}\d{4}\b/g;

// Two phrasings the real pages use for incompatibility (epic.md 7.1 only
// documents the first; the second was found on COMP8539 — see
// updates/002.md discrepancy log). Split on whichever appears first.
const INCOMPATIBLE_SPLIT_RE =
  /Incompatible with|You are not able to enrol in this course if you have (?:previously )?completed/i;

/**
 * Parse a course page (`https://programsandcourses.anu.edu.au/<year>/course/<code>`)
 * into the catalogue JSON shape. Pure — no network. `code`/`year` come from
 * the caller (the URL the page was fetched from), not scraped, so `level`
 * (epic.md section 8: first digit of the code's number × 1000) is always
 * derivable even if the page is malformed.
 */
export function parseCourse(html: string, code: string, year: number): CourseJson {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const parseWarnings: string[] = [];

  const title = doc.querySelector(".intro__degree-title__component")?.textContent?.trim();
  if (!title) parseWarnings.push("title not found");

  const units = parseUnits(doc);
  if (units === null) parseWarnings.push("Unit Value not found");

  const { offeredS1, offeredS2, offeringKnown } = parseOffering(doc);
  if (!offeringKnown) parseWarnings.push("Offering not published yet");

  const requisiteRaw = doc.querySelector(".requisite")?.textContent ?? null;
  let prereqText: string | null = null;
  let incompatible: string[] = [];
  if (requisiteRaw !== null) {
    const splitAt = requisiteRaw.search(INCOMPATIBLE_SPLIT_RE);
    const before = (splitAt >= 0 ? requisiteRaw.slice(0, splitAt) : requisiteRaw).trim();
    prereqText = before.length > 0 ? before : null;
    if (splitAt >= 0) {
      incompatible = [...new Set(requisiteRaw.slice(splitAt).match(CODE_RE) ?? [])];
    }
  } else {
    parseWarnings.push("Requisite and Incompatibility section not found");
  }

  const prereqExpr = prereqText !== null ? parsePrereq(prereqText) : null;
  if (prereqText !== null && prereqExpr === null) {
    parseWarnings.push(`prereq_text could not be parsed safely: "${prereqText}"`);
  }

  return {
    code,
    year,
    title: title ?? code,
    units: units ?? 6,
    level: levelFromCode(code),
    offeredS1,
    offeredS2,
    offeringKnown,
    prereqText,
    prereqExpr,
    incompatible,
    repeatableTimes: 1,
    parseWarnings,
  };
}

function parseUnits(doc: Document): number | null {
  for (const li of doc.querySelectorAll(".degree-summary__requirements-units")) {
    const match = li.textContent?.match(/(\d+)\s*units?/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function parseOffering(doc: Document): {
  offeredS1: boolean;
  offeredS2: boolean;
  offeringKnown: boolean;
} {
  for (const li of doc.querySelectorAll(".degree-summary__code")) {
    const heading = li.querySelector(".degree-summary__code-heading")?.textContent?.trim();
    if (heading !== "Offered in") continue;
    const headingEl = li.querySelector(".degree-summary__code-heading");
    const rest = (li.textContent ?? "").replace(headingEl?.textContent ?? "", "").trim();
    const offeredS1 = /First Semester/i.test(rest);
    const offeredS2 = /Second Semester/i.test(rest);
    return { offeredS1, offeredS2, offeringKnown: offeredS1 || offeredS2 };
  }
  return { offeredS1: false, offeredS2: false, offeringKnown: false };
}

/** epic.md section 8: first digit of the 4-digit number × 1000. */
export function levelFromCode(code: string): number {
  const match = code.match(/\d{4}/);
  if (!match) return 0;
  return Number(match[0][0]) * 1000;
}
