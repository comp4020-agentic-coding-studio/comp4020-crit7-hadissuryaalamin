import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourse } from "../scripts/scrape/parse-course.ts";
import { parseProgram } from "../scripts/scrape/parse-program.ts";
import { parsePrereq } from "../scripts/scrape/parse-prereq.ts";
import { parseSpecialisation } from "../scripts/scrape/parse-specialisation.ts";
import { applySpecialisationOverrides } from "../data/overrides/specialisations.ts";

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

  it("task 003 regression: skips every line inside the Either/Or pathway block, not just the 'Either:'/'OR' marker lines — a sub-header inside the block ('12 units from completion of a research project or industry internship in the following list:') must not leak out as its own group", () => {
    const leaked = program.groups.find(
      (g) => g.courses?.length === 2 && g.courses.includes("COMP8715") && g.courses.includes("COMP8830"),
    );
    expect(leaked).toBeUndefined();
    const sum = program.groups.reduce((s, g) => s + g.unitsRequired, 0);
    expect(sum).toBe(66); // 6 + 6 + 24 + 18 + 12 — everything except the 30-unit pathway, which is out of scope here
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

  it("task 011: turns the Specialisation choice line into a 24-unit sentinel slot group, not a warning, and reads the (code, name) pairs from the page's own Specialisations link section", () => {
    const slot = program.groups.find((g) => g.specialisation === "__SLOT__");
    expect(slot?.unitsRequired).toBe(24);
    expect(slot?.courses).toEqual([]);
    expect(program.parseWarnings.some((w) => /Specialisation/i.test(w))).toBe(false);

    expect(program.specialisations).toEqual([
      { code: "ARTIF-SPEC", name: "Artificial Intelligence" },
      { code: "CMSY-SPEC", name: "Computer Systems" },
    ]);
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

  it("task 011: capitalises the list-header fragment name instead of shipping the lowercase mid-sentence fragment (epic.md 15)", () => {
    const foundational = program.groups.find((g) => g.courses?.includes("MATH6005"));
    expect(foundational?.name).toBe("Foundational courses");
    const project = program.groups.find((g) => g.courses?.includes("COMP8830"));
    expect(project?.name).toBe("Project courses");
  });

  it("task 011: turns the Specialisation choice line into a 24-unit sentinel slot group and reads specialisation links from the page's own <ul> section", () => {
    const slot = program.groups.find((g) => g.specialisation === "__SLOT__");
    expect(slot?.unitsRequired).toBe(24);
    expect(program.parseWarnings.some((w) => /Specialisation/i.test(w))).toBe(false);
    expect(program.specialisations).toEqual([
      { code: "ARTIF-SPEC", name: "Artificial Intelligence" },
      { code: "CMSY-SPEC", name: "Computer Systems" },
    ]);
  });
});

describe("parseProgram (VCOMP 2026, task 011: COMP8800 override input shape, bare-<p> Specialisation names, choice/compulsory headers)", () => {
  const program = parseProgram(fixture("program-vcomp-2026.html"), "VCOMP", 2026);

  it("reads name, total units and semesters", () => {
    expect(program.name).toBe("Master of Computing (Advanced)");
    expect(program.totalUnits).toBe(96);
    expect(program.semesters).toBe(4);
  });

  it("recognises the professional-practice choice header with no adjective", () => {
    const choice = program.groups.find((g) => g.courses?.includes("COMP6250"));
    expect(choice?.unitsRequired).toBe(6);
    expect([...(choice?.courses ?? [])].sort()).toEqual(["COMP6250", "COMP8260"]);
  });

  it("recognises the compulsory-courses header", () => {
    const compulsory = program.groups.find((g) => g.courses?.includes("COMP6442"));
    expect(compulsory?.unitsRequired).toBe(12);
    expect([...(compulsory?.courses ?? [])].sort()).toEqual(["COMP6442", "COMP6445"]);
  });

  it("does not guess the split '24 units from completion of' + course-on-next-line project group — leaves it to data/overrides/VCOMP.ts and warns instead", () => {
    expect(program.groups.some((g) => g.courses?.includes("COMP8800"))).toBe(false);
    expect(program.parseWarnings.some((w) => /unrecognised requirement line/i.test(w) && /24 units from completion of/i.test(w))).toBe(true);
  });

  it("skips every bare '<p>Name</p>' specialisation-name line after the Specialisation header without warning, even though there's no wrapping <ul>", () => {
    const slot = program.groups.find((g) => g.specialisation === "__SLOT__");
    expect(slot?.unitsRequired).toBe(24);
    expect(program.parseWarnings.some((w) => /Artificial Intelligence|Specialisation/i.test(w))).toBe(false);
  });

  it("reads all 8 specialisation links, including CSEC-SPEC (VCOMP-only, not offered by MCOMP)", () => {
    expect(program.specialisations).toEqual([
      { code: "ARTIF-SPEC", name: "Artificial Intelligence" },
      { code: "COMP-SPEC", name: "Computational Foundations" },
      { code: "CMSY-SPEC", name: "Computer Systems" },
      { code: "CSEC-SPEC", name: "Cyber Security" },
      { code: "DTSC-SPEC", name: "Data Science" },
      { code: "HCCM-SPEC", name: "Human-Centred and Creative Computing" },
      { code: "MCHL-SPEC", name: "Machine Learning" },
      { code: "SOFT-SPEC", name: "Software Development" },
    ]);
  });

  it("recognises the inline 'further ... from the subject area X or Y' filter and the elective-courses filter", () => {
    const filter = program.groups.find((g) => g.kind === "filter" && g.unitsRequired === 18);
    expect([...(filter?.filterSubjects ?? [])].sort()).toEqual(["COMP", "ENGN"]);
    const electives = program.groups.find((g) => g.kind === "filter" && g.unitsRequired === 12);
    expect(electives?.filterSubjects ?? null).toBeNull();
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

describe("parseSpecialisation (ARTIF-SPEC 2026, epic.md 15)", () => {
  const spec = parseSpecialisation(
    fixture("specialisation-artif-spec-2026.html"),
    "ARTIF-SPEC",
    2026,
  );

  it("reads the name and total units, and folds the bare course list into one group worth the total", () => {
    expect(spec.name).toBe("Artificial Intelligence");
    expect(spec.totalUnits).toBe(24);
    expect(spec.groups).toHaveLength(1);
    expect(spec.groups[0]).toMatchObject({
      kind: "list",
      unitsRequired: 24,
      specialisation: "ARTIF-SPEC",
      courses: ["COMP6262", "COMP6320", "COMP8620", "COMP8691"],
    });
  });

  it("logs the 8000-level minimum as out of scope (epic.md section 5), not a group", () => {
    expect(spec.warnings.some((w) => w.includes("out of scope by design"))).toBe(true);
  });
});

describe("parseSpecialisation (CMSY-SPEC 2026, epic.md 15)", () => {
  const spec = parseSpecialisation(
    fixture("specialisation-cmsy-spec-2026.html"),
    "CMSY-SPEC",
    2026,
  );

  it("splits the minimum/maximum sub-lists into two groups summing to the total, no override needed", () => {
    expect(spec.totalUnits).toBe(24);
    expect(spec.groups).toHaveLength(2);
    const required = spec.groups.find((g) => g.name === "Required list courses");
    const optional = spec.groups.find((g) => g.name === "Optional list courses");
    expect(required).toMatchObject({
      kind: "list",
      unitsRequired: 12,
      specialisation: "CMSY-SPEC",
      courses: ["COMP8300", "COMP8045", "COMP8712"],
    });
    expect(optional).toMatchObject({ kind: "list", unitsRequired: 12 });
    expect(optional?.courses).toHaveLength(7);
    const sum = spec.groups.reduce((s, g) => s + g.unitsRequired, 0);
    expect(sum).toBe(spec.totalUnits);
  });
});

describe("parseSpecialisation (HCCM-SPEC 2026, epic.md 15) — needs an override", () => {
  const parsed = parseSpecialisation(
    fixture("specialisation-hccm-spec-2026.html"),
    "HCCM-SPEC",
    2026,
  );

  it("cannot fold the unit-less compulsory COMP6390 line into a group, and warns instead", () => {
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups.some((g) => g.courses?.includes("COMP6390"))).toBe(false);
    expect(
      parsed.warnings.some((w) => w.includes("COMP6390") && w.includes("no stated units")),
    ).toBe(true);
  });

  it("sums to the full 24 units once data/overrides/specialisations.ts adds the 6-unit compulsory group", () => {
    const { groups, warnings } = applySpecialisationOverrides(
      "HCCM-SPEC",
      2026,
      parsed.groups,
      parsed.warnings,
    );
    const compulsory = groups.find((g) => g.name === "Compulsory courses");
    expect(compulsory).toMatchObject({ kind: "list", unitsRequired: 6, courses: ["COMP6390"] });
    const sum = groups.reduce((s, g) => s + g.unitsRequired, 0);
    expect(sum).toBe(24);
    expect(warnings.some((w) => w.includes("COMP6390"))).toBe(false);
  });
});

describe("parseSpecialisation (SOFT-SPEC 2026, epic.md 15) — needs an override", () => {
  const parsed = parseSpecialisation(
    fixture("specialisation-soft-spec-2026.html"),
    "SOFT-SPEC",
    2026,
  );

  it("parses the compulsory, filter-with-exclusion and (literal, inconsistent) max-list groups", () => {
    expect(parsed.groups).toHaveLength(3);
    const compulsory = parsed.groups.find((g) => g.name === "Compulsory courses");
    expect(compulsory).toMatchObject({ kind: "list", unitsRequired: 12 });
    const filter = parsed.groups.find((g) => g.kind === "filter");
    expect(filter).toMatchObject({
      unitsRequired: 6,
      filterSubjects: ["COMP"],
      filterMinLevel: 8000,
    });
    const optional = parsed.groups.find((g) => g.name === "Optional list courses");
    expect(optional?.unitsRequired).toBe(12);
    // Literal parse overshoots the fixed 24-unit total (12+6+12=30) until
    // the override below corrects it.
    const literalSum = parsed.groups.reduce((s, g) => s + g.unitsRequired, 0);
    expect(literalSum).toBe(30);
  });

  it("warns that the filter's stated course exclusion isn't structurally enforced", () => {
    expect(
      parsed.warnings.some((w) => w.includes("COMP8715") && w.includes("not enforced")),
    ).toBe(true);
  });

  it("warns about the unmodeled MCOMP-substitution footnote (never guessed at)", () => {
    expect(parsed.warnings.some((w) => w.includes("unrecognised requirement line"))).toBe(true);
  });

  it("sums to exactly 24 once the override corrects the max-list group to 6 units", () => {
    const { groups } = applySpecialisationOverrides("SOFT-SPEC", 2026, parsed.groups, parsed.warnings);
    const optional = groups.find((g) => g.name === "Optional list courses");
    expect(optional?.unitsRequired).toBe(6);
    const sum = groups.reduce((s, g) => s + g.unitsRequired, 0);
    expect(sum).toBe(24);
  });
});
