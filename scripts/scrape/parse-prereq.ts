import type { PrereqExpr } from "./types.ts";

// Known ANU lead-in phrasings before the actual requirement clause. Only
// these specific, explicitly-recognised phrasings are stripped — unlike
// dropping "everything before the first code", which would risk silently
// discarding disqualifying context (e.g. a program name) that happens to
// precede the first code in some other sentence shape. Anything not
// starting with one of these is parsed as-is (and will typically fail to
// tokenize below, which is the safe direction to fail in).
const LEADIN_RE =
  /^\s*(?:to enrol in this course you must(?:\s+have)?\s*(?:successfully\s+)?(?:completed)?:?|students must have(?:\s+successfully)?\s*completed:?|you must have(?:\s+successfully)?\s*completed:?|you must\s*:?)\s*/i;

// The one whole-sentence pattern the client called out explicitly (epic.md
// 18.3): a program *exclusion*, sometimes the entire prereqText on its own.
const NEGATE_PROGRAM_RE =
  /^you are not able to enrol in this course if you are enrolled in\s+/i;

const CODE_RE = /^[A-Z]{4}\d{4}\b/;
const BOUNDARY_RE = /\b(?:or|and)\b|[)]/i;
const MAJOR_WORD_RE = /\bmajors?\b/i;

// Program full names this app knows a short plan-programCode for (epic.md
// 18.3). Sorted longest-first so a name that is itself a prefix of another
// (or contains its own "and", like MMLCV) is matched whole before a shorter
// candidate can match a truncated prefix of it.
const KNOWN_PROGRAMS: { name: string; code: string }[] = [
  { name: "Master of Machine Learning and Computer Vision", code: "MMLCV" },
  { name: "Master of Computing (Advanced)", code: "VCOMP" },
  { name: "Master of Computing", code: "MCOMP" },
].sort((a, b) => b.name.length - a.name.length);

function matchKnownProgramPrefix(text: string): { name: string; code: string } | null {
  const lower = text.toLowerCase();
  for (const p of KNOWN_PROGRAMS) {
    if (lower.startsWith(p.name.toLowerCase())) return p;
  }
  return null;
}

/** Resolve a captured program-name phrase (already stripped of a leading
 * "the ") to its short code, or return the phrase itself verbatim when it
 * doesn't match a known program (epic.md 18.3: "any other named program ->
 * a program leaf with its full name"). */
function resolveProgramCode(rawName: string): string {
  const clean = rawName.trim().replace(/^the\s+/i, "").trim();
  return matchKnownProgramPrefix(clean)?.code ?? clean;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// --- Tokenizer -------------------------------------------------------------
// Turns a lead-in-stripped clause into a token stream, refusing (returning
// null) the moment it meets anything it doesn't recognise — units, GPA,
// permission codes, majors, project-group eligibility, or just an
// unrecognised word. Never guess.

type Token =
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "and" }
  | { t: "or" }
  | { t: "code"; code: string }
  | { t: "concurrentMod" } // "(have) completed or be currently enrolled in"
  | { t: "completedMod" } // "(have) completed"
  | { t: "enrolledMod" } // "(be) enrolled in"
  | { t: "programName"; text: string };

const CONCURRENT_MOD_RE = /^(?:have\s+)?completed\s+or\s+be\s+currently\s+enrolled\s+in\b\s*/i;
const COMPLETED_MOD_RE = /^(?:have\s+)?completed\b\s*/i;
const ENROLLED_MOD_RE = /^(?:be\s+)?enrolled\s+in\b\s*/i;
const OR_RE = /^or\b\s*/i;
const AND_RE = /^and\b\s*/i;
const PUNCT_RE = /^[,.;:]+\s*/;
const WS_RE = /^\s+/;

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpExecArray | null;

    if ((m = WS_RE.exec(rest))) {
      i += m[0].length;
      continue;
    }
    if (rest[0] === "(") {
      tokens.push({ t: "lparen" });
      i += 1;
      continue;
    }
    if (rest[0] === ")") {
      tokens.push({ t: "rparen" });
      i += 1;
      continue;
    }
    if ((m = PUNCT_RE.exec(rest))) {
      i += m[0].length;
      continue;
    }
    if ((m = CONCURRENT_MOD_RE.exec(rest))) {
      tokens.push({ t: "concurrentMod" });
      i += m[0].length;
      continue;
    }
    if ((m = COMPLETED_MOD_RE.exec(rest))) {
      tokens.push({ t: "completedMod" });
      i += m[0].length;
      continue;
    }
    if ((m = ENROLLED_MOD_RE.exec(rest))) {
      tokens.push({ t: "enrolledMod" });
      i += m[0].length;
      const nameCapture = captureProgramName(text.slice(i));
      if (!nameCapture) return null;
      tokens.push({ t: "programName", text: nameCapture.raw });
      i += nameCapture.length;
      continue;
    }
    if ((m = CODE_RE.exec(rest))) {
      tokens.push({ t: "code", code: m[0] });
      i += m[0].length;
      continue;
    }
    if ((m = OR_RE.exec(rest))) {
      tokens.push({ t: "or" });
      i += m[0].length;
      continue;
    }
    if ((m = AND_RE.exec(rest))) {
      tokens.push({ t: "and" });
      i += m[0].length;
      continue;
    }
    // Anything else — a stray word (unit counts, GPA, permission, major,
    // project-group text, or just unrecognised phrasing) — bail entirely.
    return null;
  }
  return tokens;
}

/** Captures the program-name phrase immediately following an "enrolled in"
 * modifier: a known program name matched as a whole (even one containing
 * its own "and", like MMLCV) takes priority; otherwise everything up to the
 * next top-level "or"/"and"/")" is captured as an "other" program's full
 * name. Returns null (bail the whole parse) for a name that mentions a
 * major — epic.md 18.3 keeps major-eligibility text uncheckable regardless
 * of phrasing. */
function captureProgramName(rest: string): { raw: string; length: number } | null {
  const theMatch = /^the\s+/i.exec(rest);
  const afterThe = theMatch ? rest.slice(theMatch[0].length) : rest;
  const theLen = theMatch ? theMatch[0].length : 0;

  const known = matchKnownProgramPrefix(afterThe);
  if (known) {
    return { raw: known.name, length: theLen + known.name.length };
  }

  const boundary = rest.search(BOUNDARY_RE);
  const raw = (boundary === -1 ? rest : rest.slice(0, boundary)).trim().replace(/[.;:,]+$/, "");
  if (!raw) return null;
  if (MAJOR_WORD_RE.test(raw)) return null;
  return { raw, length: boundary === -1 ? rest.length : boundary };
}

// --- Recursive-descent over tokens -----------------------------------------

/** Splits a bare code/paren/and-or token stream (no modifiers) into
 * depth-aware top-level terms and the connectives between them. */
function splitByTopLevelConnective(tokens: Token[]): {
  terms: Token[][];
  ops: ("and" | "or")[];
} {
  const terms: Token[][] = [];
  const ops: ("and" | "or")[] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const tok of tokens) {
    if (tok.t === "lparen") {
      depth += 1;
      current.push(tok);
      continue;
    }
    if (tok.t === "rparen") {
      depth -= 1;
      current.push(tok);
      continue;
    }
    if (depth === 0 && (tok.t === "or" || tok.t === "and")) {
      terms.push(current);
      current = [];
      ops.push(tok.t);
      continue;
    }
    current.push(tok);
  }
  terms.push(current);
  return { terms, ops };
}

function parseCodeTerm(tokens: Token[]): PrereqExpr | null {
  if (tokens.length === 1 && tokens[0]!.t === "code") {
    return { kind: "course", code: (tokens[0] as { t: "code"; code: string }).code, allowConcurrent: false };
  }
  if (tokens.length >= 2 && tokens[0]!.t === "lparen" && tokens[tokens.length - 1]!.t === "rparen") {
    return parseCodeExpr(tokens.slice(1, -1));
  }
  return null;
}

/** Parses a token span that should be nothing but codes, "and"/"or", and
 * explicit parentheses (no modifiers) — the object of a modifier, or a bare
 * clause with no modifier at all. A mixed and/or at the same nesting level
 * with no parentheses to disambiguate it is left null (never guess). */
function parseCodeExpr(tokens: Token[]): PrereqExpr | null {
  if (tokens.length === 0) return null;
  const { terms, ops } = splitByTopLevelConnective(tokens);
  if (new Set(ops).size > 1) return null;
  const parsedTerms = terms.map(parseCodeTerm);
  if (parsedTerms.some((p) => p === null)) return null;
  if (parsedTerms.length === 1) return parsedTerms[0]!;
  const op: "and" | "or" = ops[0] === "and" ? "and" : "or";
  return { kind: op, exprs: parsedTerms as PrereqExpr[] };
}

function setAllowConcurrent(expr: PrereqExpr, value: boolean): PrereqExpr {
  if (expr.kind === "course") return { ...expr, allowConcurrent: value };
  if (expr.kind === "program") return expr;
  return { kind: expr.kind, exprs: expr.exprs.map((e) => setAllowConcurrent(e, value)) };
}

/** Parses one top-level clause: an optional leading modifier (concurrent,
 * completed, or enrolled-in-a-program) applied to the rest of the clause. */
function parseClause(tokens: Token[]): PrereqExpr | null {
  if (tokens.length === 0) return null;
  const head = tokens[0]!;
  const rest = tokens.slice(1);

  if (head.t === "enrolledMod") {
    if (rest.length === 1 && rest[0]!.t === "programName") {
      const name = (rest[0] as { t: "programName"; text: string }).text;
      return { kind: "program", programCode: resolveProgramCode(name), negate: false };
    }
    return null;
  }
  if (head.t === "concurrentMod" || head.t === "completedMod") {
    const inner = parseCodeExpr(rest);
    if (!inner) return null;
    return setAllowConcurrent(inner, head.t === "concurrentMod");
  }
  // No modifier: a bare code list (possibly parenthesised, possibly a
  // single code) joined by a uniform connective.
  return parseCodeExpr(tokens);
}

/** Splits a full token stream into top-level clauses. A new clause starts
 * only when a top-level "and"/"or" is immediately followed by a modifier
 * keyword or an opening parenthesis — a bare code continuing after a
 * connective stays part of the clause already in progress (e.g. "completed
 * or be currently enrolled in COMP6710 OR COMP6730" is one clause, both
 * codes concurrent-eligible; the next "OR have completed ..." starts a new
 * one). Returns null if the connectives between clauses aren't uniform. */
function splitTopLevelClauses(tokens: Token[]): { clauses: Token[][]; op: "and" | "or" } | null {
  const clauses: Token[][] = [];
  const opsBetween: ("and" | "or")[] = [];
  let current: Token[] = [];
  let depth = 0;

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const tok = tokens[idx]!;
    if (tok.t === "lparen") {
      depth += 1;
      current.push(tok);
      continue;
    }
    if (tok.t === "rparen") {
      depth -= 1;
      current.push(tok);
      continue;
    }
    if (depth === 0 && (tok.t === "or" || tok.t === "and")) {
      const next = tokens[idx + 1];
      const startsNewClause =
        !!next &&
        (next.t === "concurrentMod" ||
          next.t === "completedMod" ||
          next.t === "enrolledMod" ||
          next.t === "lparen");
      if (startsNewClause) {
        clauses.push(current);
        current = [];
        opsBetween.push(tok.t);
        continue;
      }
      // Continuation of the current clause's own code list.
      current.push(tok);
      continue;
    }
    current.push(tok);
  }
  clauses.push(current);

  if (new Set(opsBetween).size > 1) return null;
  const op: "and" | "or" = opsBetween[0] === "and" ? "and" : "or";
  return { clauses, op };
}

/**
 * Parse a requisite sentence (as it appears in `prereqText`, boilerplate
 * lead-in and all) into a requirement tree, or null if it can't be parsed
 * confidently (epic.md 18.3). See scripts/scrape/types.ts's `PrereqExpr` for
 * the shape and what each leaf kind means.
 */
export function parsePrereq(text: string): PrereqExpr | null {
  const normalized = normalize(text);
  if (!normalized) return null;
  const stripped = normalized.replace(/\.+$/, "");

  // The one whole-sentence special case: a program exclusion, which may be
  // the entire prereqText on its own (epic.md 18.3).
  if (NEGATE_PROGRAM_RE.test(stripped)) {
    const afterLeadin = stripped.replace(NEGATE_PROGRAM_RE, "");
    const capture = captureProgramName(afterLeadin);
    if (!capture) return null;
    const leftover = afterLeadin.slice(capture.length).trim().replace(/^[.;:,]+/, "").trim();
    if (leftover.length > 0) return null; // more than just the one program name — too complex
    return { kind: "program", programCode: resolveProgramCode(capture.raw), negate: true };
  }

  const clause = stripped.replace(LEADIN_RE, "").trim();
  if (!clause) return null;

  const tokens = tokenize(clause);
  if (!tokens || tokens.length === 0) return null;

  const split = splitTopLevelClauses(tokens);
  if (!split) return null;

  const parsedClauses = split.clauses.map(parseClause);
  if (parsedClauses.some((c) => c === null)) return null;
  if (parsedClauses.length === 1) return parsedClauses[0]!;
  return { kind: split.op, exprs: parsedClauses as PrereqExpr[] };
}
