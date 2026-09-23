import type { PrereqExpr } from "./types.ts";

const CODE_RE = /\b[A-Z]{4}\d{4}\b/g;

// Known ANU lead-in phrasings before the actual requirement clause. Only
// these specific, explicitly-recognised phrasings are stripped — unlike
// dropping "everything before the first code", which would risk silently
// discarding disqualifying context (e.g. a program name) that happens to
// precede the first code in some other sentence shape. Anything not
// starting with one of these is parsed as-is (and will typically fail the
// connective check below, which is the safe direction to fail in).
const LEADIN_RE =
  /^\s*(?:to enrol in this course you must(?:\s+have)?\s*(?:successfully\s+)?(?:completed)?:?|students must have(?:\s+successfully)?\s*completed:?|you must have(?:\s+successfully)?\s*completed:?)\s*/i;

// Any of these appearing in the requirement clause means it isn't a plain
// "codes joined by one connective" requisite — leave it unparsed rather than
// guess (epic.md 9.3 "Prereq parsing").
const DISQUALIFYING_WORDS =
  /\b(unit|units|program|programme|permission|major|majors|bachelor|master|masters|diploma|studying|enrolled|enrolling|equivalent)\b/i;

// Explicit grouping (parentheses) always means "don't guess": epic.md 9.3
// only covers flat "all and" / "all or" sentences.
const HAS_PARENS = /[()]/;

/**
 * Parse a requisite sentence (as it appears in `prereqText`, boilerplate
 * lead-in and all — e.g. "To enrol in this course you must have completed:
 * COMP1100 and COMP1130.") into a flat AND/OR expression over course codes,
 * or null if it can't be parsed safely.
 *
 * A known ANU lead-in phrasing is stripped first (see LEADIN_RE); what
 * remains parses only when it is exactly course codes joined by a single
 * kind of connective — all "and" or all "or" (case-insensitive) — with
 * nothing else in it: no parenthesised grouping, and no mention of units,
 * programs, permission or majors (which signal an admission-state condition
 * rather than a plain course list). Mixed and/or, an unrecognised lead-in,
 * and anything else is left `null`. Never guess.
 */
export function parsePrereq(text: string): PrereqExpr | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const clause = trimmed.replace(LEADIN_RE, "");
  if (HAS_PARENS.test(clause)) return null;

  const codes = clause.match(CODE_RE);
  if (!codes || codes.length === 0) return null;

  // Everything left after removing the codes should be nothing but
  // connectives ("and"/"or"), punctuation and whitespace.
  const withoutCodes = clause.replace(CODE_RE, " ");
  if (DISQUALIFYING_WORDS.test(withoutCodes)) return null;

  const connectiveTokens = withoutCodes
    .split(/[\s,.;:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (connectiveTokens.length === 0) {
    // A single code, no connective at all — trivially an AND of one.
    return { op: "AND", codes: dedupe(codes) };
  }

  const kinds = new Set(
    connectiveTokens.map((t) => {
      const lower = t.toLowerCase();
      if (lower === "and") return "AND";
      if (lower === "or") return "OR";
      return null;
    }),
  );

  if (kinds.has(null) || kinds.size !== 1) {
    // Stray words, or both "and" and "or" present — mixed or unrecognised.
    return null;
  }

  const op = [...kinds][0] as "AND" | "OR";
  return { op, codes: dedupe(codes) };
}

function dedupe(codes: string[]): string[] {
  return [...new Set(codes)];
}
