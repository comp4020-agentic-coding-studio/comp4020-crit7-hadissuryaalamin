import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourse } from "../scripts/scrape/parse-course.ts";
import { parseProgram } from "../scripts/scrape/parse-program.ts";
import { parsePrereq } from "../scripts/scrape/parse-prereq.ts";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8");
}

describe("parseProgram (MMLCV 2026, epic.md 7.4)", () => {
  const program = parseProgram(fixture("program-mmlcv-2026.html"), "MMLCV", 2026);

  it("reads name, total units and semesters (epic.md D13: duration in years x 2, not hard-coded)", () => {
    expect(program.name).toBe("Master of Machine Learning and Computer Vision");
    expect(program.totalUnits).toBe(96);
    expect(program.semesters).toBe(4);
  });

  it("extracts the core, professional practice, MLCV core and electives list groups in document order", () => {
    const byCourses = (courses: string[]) =>
      program.groups.find(
        (g) => g.kind === "list" && g.courses?.length === courses.length && courses.every((c) => g.courses?.includes(c)),
      );

    const core = byCourses(["COMP6710"]);
    expect(core?.unitsRequired).toBe(6);

    const profPractice = byCourses(["COMP6250", "COMP8260"]);
    expect(profPractice?.unitsRequired).toBe(6);

    const mlcvCore = byCourses([
      "COMP6528",
      "COMP6670",
      "COMP8536",
      "COMP8539",
      "COMP8600",
      "COMP8650",
    ]);
    expect(mlcvCore?.unitsRequired).toBe(24);

    const electives = byCourses([
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
    ]);
    expect(electives?.unitsRequired).toBe(18);

    // Groups appear in the page's own order, which is the evaluation order
    // credit allocation walks (epic.md 9.1).
    const positions = [core, profPractice, mlcvCore, electives].map((g) => g?.position);
    expect(positions).toEqual([...positions].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("extracts the 12-unit university electives filter group (epic.md 9.1: any subject, level >= 6000)", () => {
    const uniElectives = program.groups.find((g) => g.kind === "filter");
    expect(uniElectives?.unitsRequired).toBe(12);
    expect(uniElectives?.filterMinLevel).toBe(6000);
    expect(uniElectives?.filterSubjects ?? null).toBeNull();
  });

  it("does not guess the project pathway — leaves it to a hand-written override and warns instead (epic.md 7.3)", () => {
    expect(program.groups.some((g) => g.pathway)).toBe(false);
    expect(program.groups.some((g) => g.courses?.includes("COMP6442"))).toBe(false);
    expect(program.groups.some((g) => g.courses?.includes("COMP8800"))).toBe(false);
    expect(program.parseWarnings.some((w) => /pathway/i.test(w))).toBe(true);
  });

  it("notes the out-of-scope 8000-level rule rather than dropping it silently (epic.md section 5)", () => {
    expect(program.parseWarnings.some((w) => /8000-level/i.test(w) && /out of scope/i.test(w))).toBe(
      true,
    );
  });
});

describe("parseProgram (MCOMP 2025, task 003: unit-less/dashed course lines and phrasings the MMLCV fixture doesn't exercise)", () => {
  const program = parseProgram(fixture("program-mcomp-2025.html"), "MCOMP", 2025);

  it("gathers course lines with no '(N units)' suffix and an optional dash after the code", () => {
    const compulsory = program.groups.find((g) => g.courses?.includes("COMP6710"));
    expect(compulsory?.unitsRequired).toBe(24);
    expect([...(compulsory?.courses ?? [])].sort()).toEqual(
      ["COMP6250", "COMP6442", "COMP6710", "COMP8260"].sort(),
    );
  });

  it("recognises the 'one of the following <adjective> courses:' choice-header phrasing", () => {
    const foundational = program.groups.find((g) => g.courses?.includes("MATH6005"));
    expect(foundational?.unitsRequired).toBe(6);
    expect(foundational?.courses).toEqual(["MATH6005", "COMP6260"]);

    const project = program.groups.find((g) => g.courses?.includes("COMP8830"));
    expect(project?.unitsRequired).toBe(12);
    expect(project?.courses).toEqual(["COMP8715", "COMP8830"]);
  });

  it("recognises the inline 'further ... courses from the subject area X or Y' filter phrasing", () => {
    const filter = program.groups.find((g) => g.kind === "filter" && g.unitsRequired === 18);
    expect(filter).toBeDefined();
    expect([...(filter?.filterSubjects ?? [])].sort()).toEqual(["COMP", "ENGN"]);
    expect(filter?.filterMinLevel).toBe(6000);
  });

  it("recognises MCOMP/VCOMP's own 'elective courses offered by ANU' phrasing as a filter group with no invented level floor", () => {
    const electives = program.groups.find(
      (g) => g.kind === "filter" && g.unitsRequired === 12 && !g.filterSubjects,
    );
    expect(electives).toBeDefined();
    expect(electives?.filterMinLevel ?? null).toBeNull();
  });

  it("skips administrative footnotes (double-counting rule) without a parseWarning", () => {
    expect(
      program.parseWarnings.some((w) => /double counted/i.test(w)),
    ).toBe(false);
  });

  it("still warns (not guesses) about the un-parseable Specialisation choice block", () => {
    expect(program.parseWarnings.some((w) => /Specialisation/i.test(w))).toBe(true);
  });
});

describe("parseProgram (MCOMP 2026, task 003: the multi-paragraph 'following subject areas:' filter phrasing)", () => {
  const program = parseProgram(fixture("program-mcomp-2026.html"), "MCOMP", 2026);

  it("recognises 'N units from completion of the following compulsory courses:'", () => {
    const compulsory = program.groups.find((g) => g.courses?.includes("COMP6120"));
    expect(compulsory?.unitsRequired).toBe(30);
    expect([...(compulsory?.courses ?? [])].sort()).toEqual(
      ["COMP6120", "COMP6442", "COMP7710", "COMP8280"].sort(),
    );
  });

  it("gathers the subject-area codes from separate 'CODE Name' lines below the header", () => {
    const filter = program.groups.find((g) => g.kind === "filter" && g.unitsRequired === 18);
    expect(filter).toBeDefined();
    expect([...(filter?.filterSubjects ?? [])].sort()).toEqual(["COMP", "ENGN"]);
    expect(filter?.filterMinLevel).toBe(6000);
  });

  it("still recognises the generic 'in the following list:' header for the foundational/project groups", () => {
    const foundational = program.groups.find((g) => g.courses?.includes("MATH6005"));
    expect(foundational?.unitsRequired).toBe(6);
    const project = program.groups.find((g) => g.courses?.includes("COMP8830"));
    expect(project?.unitsRequired).toBe(12);
  });
});

describe("parseCourse (COMP8600 2026)", () => {
  const course = parseCourse(fixture("course-comp8600-2026.html"), "COMP8600", 2026);

  it("reads units, level and the single-semester offering", () => {
    expect(course.units).toBe(6);
    expect(course.level).toBe(8000);
    expect(course.offeredS1).toBe(true);
    expect(course.offeredS2).toBe(false);
    expect(course.offeringKnown).toBe(true);
  });

  it("reads incompatible courses", () => {
    expect([...course.incompatible].sort()).toEqual(["COMP4670", "COMP8960"]);
  });

  it("keeps the raw requisite text but leaves prereq_expr null — DISCREPANCY vs epic.md 7.1/7.4 (see updates/002.md): the real page's requisite is a mixed, parenthesised OR/AND expression, not the plain 'must have completed COMP6670' the epic's key facts describe, so epic.md 9.3's parsing rule keeps it unparsed rather than guessing", () => {
    expect(course.prereqText).toContain("COMP6670");
    expect(course.prereqText).toContain("STAT6039");
    expect(course.prereqExpr).toBeNull();
  });
});

describe("parseCourse (COMP8539 2026 — the 'should parse' fixture)", () => {
  const course = parseCourse(fixture("course-comp8539-2026.html"), "COMP8539", 2026);

  it("reads units and level", () => {
    expect(course.units).toBe(6);
    expect(course.level).toBe(8000);
  });

  it("flags the offering as not yet published rather than guessing (real 2026 page has no semester listed)", () => {
    expect(course.offeringKnown).toBe(false);
    expect(course.offeredS1).toBe(false);
    expect(course.offeredS2).toBe(false);
  });

  it("reads the incompatible course from the site's other incompatibility phrasing ('not able to enrol ... if you have completed')", () => {
    expect(course.incompatible).toEqual(["ENGN8501"]);
  });

  it("parses the plain all-OR requisite", () => {
    expect(course.prereqExpr).toEqual({
      op: "OR",
      codes: ["COMP6528", "COMP4528", "ENGN4528"],
    });
  });
});

describe("parsePrereq", () => {
  it("parses a single code with no connective as a trivial AND", () => {
    expect(parsePrereq("To enrol in this course you must have completed COMP1100.")).toEqual({
      op: "AND",
      codes: ["COMP1100"],
    });
  });

  it("parses an all-AND sentence", () => {
    expect(parsePrereq("You must have completed COMP1100 and COMP1130.")).toEqual({
      op: "AND",
      codes: ["COMP1100", "COMP1130"],
    });
  });

  it("parses an all-OR sentence", () => {
    expect(parsePrereq("You must have completed COMP1100 or COMP1130 or COMP1140.")).toEqual({
      op: "OR",
      codes: ["COMP1100", "COMP1130", "COMP1140"],
    });
  });

  it("returns null for a mixed and/or expression, even with explicit grouping", () => {
    expect(
      parsePrereq("You must have completed COMP1100 or (COMP1130 and COMP1140)."),
    ).toBeNull();
  });

  it("returns null when the sentence names a program rather than only courses", () => {
    expect(
      parsePrereq("You must be enrolled in Master of Computing (Advanced) or have completed COMP6710."),
    ).toBeNull();
  });

  it("returns null when there are no course codes at all", () => {
    expect(parsePrereq("None.")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(parsePrereq("")).toBeNull();
  });
});
