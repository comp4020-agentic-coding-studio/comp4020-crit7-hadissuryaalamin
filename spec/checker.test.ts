import { describe, expect, it } from "vitest";
import { evaluate } from "../src/lib/checker";
import type {
  Catalogue,
  CatalogueCourse,
  Plan,
  PlanCourse,
  RequirementGroup,
} from "../src/lib/checker-types";

// Small, hand-built MMLCV-shaped catalogues (epic 7.3/7.4), trimmed to just
// what each test needs. Not the real scraped data - that's the scraper's job
// (task elsewhere); this only has to exercise every rule in epic 9 / 11.

function course(code: string, overrides: Partial<CatalogueCourse> = {}): CatalogueCourse {
  const level = Number(code.match(/\d/)?.[0] ?? "6") * 1000;
  return {
    code,
    year: 2026,
    title: code,
    units: 6,
    level,
    offeredS1: true,
    offeredS2: true,
    offeringKnown: true,
    prereqText: null,
    prereqExpr: null,
    repeatableTimes: 1,
    ...overrides,
  };
}

function mmlcvGroups(): RequirementGroup[] {
  return [
    {
      id: "core",
      position: 1,
      name: "Core",
      kind: "list",
      unitsRequired: 6,
      courseCodes: ["COMP6710"],
      filterSubjects: null,
      filterMinLevel: null,
      pathway: null,
      pathwayMarkers: [],
    },
    {
      id: "profprac",
      position: 2,
      name: "Professional practice",
      kind: "list",
      unitsRequired: 6,
      courseCodes: ["COMP6250", "COMP8260"],
      filterSubjects: null,
      filterMinLevel: null,
      pathway: null,
      pathwayMarkers: [],
    },
    {
      id: "mlcv-core",
      position: 3,
      name: "MLCV core",
      kind: "list",
      unitsRequired: 24,
      courseCodes: [
        "COMP6528",
        "COMP6670",
        "COMP8536",
        "COMP8539",
        "COMP8600",
        "COMP8650",
      ],
      filterSubjects: null,
      filterMinLevel: null,
      pathway: null,
      pathwayMarkers: [],
    },
    {
      id: "mlcv-electives",
      position: 4,
      name: "MLCV electives",
      kind: "list",
      unitsRequired: 18,
      courseCodes: [
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
      ],
      filterSubjects: null,
      filterMinLevel: null,
      pathway: null,
      pathwayMarkers: [],
    },
    {
      id: "pathway-a",
      position: 5,
      name: "Project pathway A",
      kind: "list",
      unitsRequired: 24,
      courseCodes: ["COMP6442", "COMP8715", "COMP8830"],
      filterSubjects: null,
      filterMinLevel: null,
      pathway: "A",
      pathwayMarkers: ["COMP6442", "COMP8715", "COMP8830"],
    },
    {
      id: "pathway-b",
      position: 6,
      name: "Project pathway B",
      kind: "list",
      unitsRequired: 24,
      courseCodes: ["COMP6445", "COMP8800"],
      filterSubjects: null,
      filterMinLevel: null,
      pathway: "B",
      pathwayMarkers: ["COMP6445", "COMP8800"],
    },
    {
      id: "electives",
      position: 7,
      name: "University electives",
      kind: "filter",
      unitsRequired: 12,
      courseCodes: [],
      filterSubjects: null,
      filterMinLevel: 6000,
      pathway: null,
      pathwayMarkers: [],
    },
  ];
}

function mmlcvCatalogue(courses: CatalogueCourse[]): Catalogue {
  const byCode: Record<string, CatalogueCourse[]> = {};
  for (const c of courses) {
    (byCode[c.code] ??= []).push(c);
  }
  return {
    program: {
      code: "MMLCV",
      year: 2026,
      name: "Master of Machine Learning and Computer Vision",
      totalUnits: 96,
      semesters: 4,
    },
    groups: mmlcvGroups(),
    courses: byCode,
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "test-plan",
    programCode: "MMLCV",
    startYear: 2026,
    startSemester: 1,
    currentSemester: 2,
    ...overrides,
  };
}

function pc(
  id: string,
  semesterIndex: number,
  courseCode: string,
  addedOrder: number,
  overrides: Partial<PlanCourse> = {},
): PlanCourse {
  return {
    id,
    semesterIndex,
    courseCode,
    unverified: false,
    units: 6,
    level: Number(courseCode.match(/\d/)?.[0] ?? "6") * 1000,
    addedOrder,
    prereqWaived: false,
    ...overrides,
  };
}

function statusOf(result: ReturnType<typeof evaluate>, planCourseId: string) {
  const found = result.courses.find((c) => c.planCourseId === planCourseId);
  if (!found) throw new Error(`no result for ${planCourseId}`);
  return found;
}

describe("checker: credit allocation (9.1)", () => {
  it("counts a course in the right group", () => {
    const catalogue = mmlcvCatalogue([course("COMP6710")]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 1, "COMP6710", 1)];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("counts");
    expect(r.groupName).toBe("Core");
    expect(result.groups.find((g) => g.name === "Core")?.earned).toBe(6);
    expect(result.totalEarned).toBe(6);
  });

  it("undergraduate course not named anywhere -> zero-credit", () => {
    const catalogue = mmlcvCatalogue([course("COMP1100", { level: 1000 })]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 1, "COMP1100", 1, { level: 1000 })];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("zero-credit");
    expect(r.messages).toContain(
      "Undergraduate course - can't count as a university elective",
    );
  });

  it("duplicate course (non-repeatable) -> already counted", () => {
    const catalogue = mmlcvCatalogue([course("COMP6710")]);
    const p = plan({ currentSemester: 2 });
    const courses = [pc("c1", 1, "COMP6710", 1), pc("c2", 2, "COMP6710", 2)];
    const result = evaluate(p, courses, catalogue);
    expect(statusOf(result, "c1").status).toBe("counts");
    const r2 = statusOf(result, "c2");
    expect(r2.status).toBe("zero-credit");
    expect(r2.messages).toContain("Already counted");
  });

  it("repeatable course (COMP8715) counts twice", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8715", { repeatableTimes: 2 }),
    ]);
    const p = plan({ currentSemester: 2 });
    const courses = [pc("c1", 1, "COMP8715", 1), pc("c2", 2, "COMP8715", 2)];
    const result = evaluate(p, courses, catalogue);
    expect(statusOf(result, "c1").status).toBe("counts");
    expect(statusOf(result, "c2").status).toBe("counts");
    expect(result.groups.find((g) => g.name === "Project pathway A")?.earned).toBe(
      12,
    );
  });

  it("list-spill: fills core list first, electives once full", () => {
    // COMP6528 is in both MLCV core (24 units, position 3) and MLCV
    // electives (18 units, position 4). First four core-list courses fill
    // the core group (24 units); a fifth spills into electives.
    const catalogue = mmlcvCatalogue([
      course("COMP6528"),
      course("COMP6670"),
      course("COMP8536"),
      course("COMP8539"),
      course("COMP8600"),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 1, "COMP6528", 1),
      pc("c2", 1, "COMP6670", 2),
      pc("c3", 1, "COMP8536", 3),
      pc("c4", 1, "COMP8539", 4),
    ];
    const result = evaluate(p, courses, catalogue);
    for (const id of ["c1", "c2", "c3", "c4"]) {
      expect(statusOf(result, id).groupName).toBe("MLCV core");
    }
    expect(result.groups.find((g) => g.name === "MLCV core")?.earned).toBe(24);

    // Now a 5th core-eligible course should spill to electives.
    const courses2 = [...courses, pc("c5", 1, "COMP8600", 5)];
    const result2 = evaluate(p, courses2, catalogue);
    expect(statusOf(result2, "c5").groupName).toBe("MLCV electives");
  });

  it("group full (no spill possible anywhere) -> zero-credit, names the full group", () => {
    // A minimal catalogue with no generic catch-all elective group (its
    // "University electives" filter group requires 0 units, i.e. already
    // full), so a second Professional-practice course truly has nowhere
    // left to go - this isolates reason 3 from the list-spill behaviour.
    const catalogue: Catalogue = {
      program: {
        code: "MMLCV",
        year: 2026,
        name: "Test",
        totalUnits: 96,
        semesters: 4,
      },
      groups: [
        {
          id: "profprac",
          position: 1,
          name: "Professional practice",
          kind: "list",
          unitsRequired: 6,
          courseCodes: ["COMP6250", "COMP8260"],
          filterSubjects: null,
          filterMinLevel: null,
          pathway: null,
          pathwayMarkers: [],
        },
        {
          id: "electives",
          position: 2,
          name: "University electives",
          kind: "filter",
          unitsRequired: 0,
          courseCodes: [],
          filterSubjects: null,
          filterMinLevel: 6000,
          pathway: null,
          pathwayMarkers: [],
        },
      ],
      courses: {
        COMP6250: [course("COMP6250")],
        COMP8260: [course("COMP8260")],
      },
    };
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 1, "COMP6250", 1), pc("c2", 1, "COMP8260", 2)];
    const result = evaluate(p, courses, catalogue);
    expect(statusOf(result, "c1").status).toBe("counts");
    const r2 = statusOf(result, "c2");
    expect(r2.status).toBe("zero-credit");
    expect(r2.messages).toContain(
      "No room: Professional practice already complete",
    );
  });

  it("over total units -> zero-credit", () => {
    const catalogue: Catalogue = {
      program: {
        code: "MMLCV",
        year: 2026,
        name: "Test",
        totalUnits: 6,
        semesters: 4,
      },
      groups: [
        {
          id: "electives",
          position: 1,
          name: "University electives",
          kind: "filter",
          unitsRequired: 12,
          courseCodes: [],
          filterSubjects: null,
          filterMinLevel: 6000,
          pathway: null,
          pathwayMarkers: [],
        },
      ],
      courses: {
        COMP6710: [course("COMP6710")],
        COMP6250: [course("COMP6250")],
      },
    };
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 1, "COMP6710", 1),
      pc("c2", 1, "COMP6250", 2),
    ];
    const result = evaluate(p, courses, catalogue);
    expect(statusOf(result, "c1").status).toBe("counts");
    const r2 = statusOf(result, "c2");
    expect(r2.status).toBe("zero-credit");
    expect(r2.messages).toContain("Degree already complete at 6 units");
  });

  it("pathway conflict: later pathway's courses go zero-credit, banner set", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP6442"),
      course("COMP6445"),
    ]);
    const p = plan({ currentSemester: 1 });
    // Option A marker appears first (addedOrder 1), Option B marker second.
    const courses = [
      pc("c1", 1, "COMP6442", 1),
      pc("c2", 1, "COMP6445", 2),
    ];
    const result = evaluate(p, courses, catalogue);
    expect(statusOf(result, "c1").status).toBe("counts");
    expect(statusOf(result, "c1").groupName).toBe("Project pathway A");
    const r2 = statusOf(result, "c2");
    expect(r2.status).toBe("zero-credit");
    expect(r2.messages).toContain(
      "Pick one project pathway: you have courses from both A and B",
    );
    expect(result.warnings).toContain(
      "Pick one project pathway: you have courses from both A and B",
    );
  });
});

describe("checker: timing (9.3)", () => {
  it("not offered in the slot's semester -> warn", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP6250", { offeredS2: false }),
    ]);
    const p = plan({ startYear: 2026, startSemester: 1, currentSemester: 1 });
    // semesterIndex 2 = S2 2026 (future relative to currentSemester 1).
    const courses = [pc("c1", 2, "COMP6250", 1)];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("warn");
    expect(r.messages).toContain("Not offered in Semester 2 2026");
  });

  it("missing prerequisite -> warn", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8600", {
        prereqText: "To enrol in this course you must have completed COMP6670",
        prereqExpr: { kind: "course", code: "COMP6670" },
      }),
      course("COMP6670"),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 2, "COMP8600", 1)];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("warn");
    expect(r.messages).toContain("Needs COMP6670 first");
  });

  it("prerequisite in the same semester is still missing", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8600", {
        prereqText: "To enrol in this course you must have completed COMP6670",
        prereqExpr: { kind: "course", code: "COMP6670" },
      }),
      course("COMP6670"),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 2, "COMP8600", 1),
      pc("c2", 2, "COMP6670", 2),
    ];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("warn");
    expect(r.messages).toContain("Needs COMP6670 first");
  });

  it("prerequisite satisfied in a strictly earlier semester -> no warning", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8600", {
        prereqText: "To enrol in this course you must have completed COMP6670",
        prereqExpr: { kind: "course", code: "COMP6670" },
      }),
      course("COMP6670"),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 1, "COMP6670", 1),
      pc("c2", 2, "COMP8600", 2),
    ];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c2");
    expect(r.messages).not.toContain("Needs COMP6670 first");
  });

  it("unparsed prerequisite text -> unknown", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8650", {
        prereqText:
          "To enrol in this course you must have completed COMP6670 or have permission of the course convener",
        prereqExpr: null,
      }),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 2, "COMP8650", 1)];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("unknown");
    expect(r.messages).toContain(
      "Check P&C: To enrol in this course you must have completed COMP6670 or have permission of the course convener",
    );
  });

  it("completed semester skips timing checks", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP6250", { offeredS1: false }),
    ]);
    const p = plan({ startYear: 2026, startSemester: 1, currentSemester: 2 });
    // semesterIndex 1 = S1 2026, already completed since currentSemester 2.
    const courses = [pc("c1", 1, "COMP6250", 1)];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("counts");
    expect(r.messages).not.toContain("Not offered in Semester 1 2026");
  });

  it("offering not published yet -> unknown", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP6250", { offeringKnown: false }),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 2, "COMP6250", 1)];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("unknown");
    expect(r.messages).toContain("Offering not published yet");
  });
});

describe("checker: permission waiver (9.16 / D15)", () => {
  it("waived prerequisite -> no prereq message, waiver note added, status by credit/offering only", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8600", {
        prereqText: "To enrol in this course you must have completed COMP6670",
        prereqExpr: { kind: "course", code: "COMP6670" },
      }),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 2, "COMP8600", 1, { prereqWaived: true })];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    // COMP8600 has room in MLCV core and is offered — with the prereq
    // waived, nothing else is wrong, so it counts.
    expect(r.status).toBe("counts");
    expect(r.messages.some((m) => m.startsWith("Needs "))).toBe(false);
    expect(r.messages.some((m) => m.startsWith("Check P&C:"))).toBe(false);
    expect(r.messages).toContain("Prerequisite waived - you have permission to enrol");
  });

  it("a waiver never hides zero-credit or offering messages", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP1100", {
        level: 1000,
        offeredS1: false,
        prereqText: "some prereq text",
        prereqExpr: { kind: "course", code: "COMP6670" },
      }),
    ]);
    const p = plan({ startYear: 2026, startSemester: 1, currentSemester: 1 });
    const courses = [
      pc("c1", 1, "COMP1100", 1, { level: 1000, prereqWaived: true }),
    ];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("zero-credit");
    expect(r.messages).toContain(
      "Undergraduate course - can't count as a university elective",
    );
    expect(r.messages).toContain("Not offered in Semester 1 2026");
    expect(r.messages).toContain("Prerequisite waived - you have permission to enrol");
  });
});

describe("checker: repeatable-course continuation (9.16 / D16)", () => {
  it("second occurrence in the immediately-next semester continues, no prereq message", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8715", {
        repeatableTimes: 2,
        prereqText: "some ANU permission-based text",
      }),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 3, "COMP8715", 1), pc("c2", 4, "COMP8715", 2)];
    const result = evaluate(p, courses, catalogue);
    const r1 = statusOf(result, "c1");
    const r2 = statusOf(result, "c2");
    // The first occurrence is not a continuation of anything — its own
    // unparsed requisite text still applies normally.
    expect(r1.status).toBe("unknown");
    expect(r1.messages).toContain(`Check P&C: ${"some ANU permission-based text"}`);
    expect(r2.status).toBe("counts");
    expect(r2.messages).toContain("Continues from Semester 3");
    expect(r2.messages.some((m) => m.startsWith("Needs "))).toBe(false);
    expect(r2.messages.some((m) => m.startsWith("Check P&C:"))).toBe(false);
  });

  it("COMP8800 (12 units per semester) follows the same continuation rule", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8800", { units: 12, repeatableTimes: 2 }),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 1, "COMP8800", 1, { units: 12 }),
      pc("c2", 2, "COMP8800", 2, { units: 12 }),
    ];
    const result = evaluate(p, courses, catalogue);
    expect(statusOf(result, "c2").messages).toContain("Continues from Semester 1");
    expect(result.groups.find((g) => g.name === "Project pathway B")?.earned).toBe(24);
    expect(result.totalEarned).toBe(24);
  });

  it("non-consecutive semesters -> warn, credit totals unchanged", () => {
    const catalogue = mmlcvCatalogue([
      course("COMP8715", { repeatableTimes: 2 }),
    ]);
    const p = plan({ currentSemester: 1 });
    const courses = [pc("c1", 1, "COMP8715", 1), pc("c2", 3, "COMP8715", 2)];
    const result = evaluate(p, courses, catalogue);
    const r2 = statusOf(result, "c2");
    expect(r2.status).toBe("warn");
    expect(r2.messages).toContain(
      "Must be taken in consecutive semesters (first part is in Semester 1)",
    );
    expect(result.groups.find((g) => g.name === "Project pathway A")?.earned).toBe(12);
    expect(result.totalEarned).toBe(12);
  });
});

describe("checker: unverified codes", () => {
  it("unverified code with room in electives -> unknown, still counts toward total", () => {
    const catalogue = mmlcvCatalogue([]);
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 1, "COMP9999", 1, { unverified: true, level: 9000 }),
    ];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("unknown");
    expect(r.messages).toContain(
      "Unverified course code - not in the ANU catalogue we loaded",
    );
    expect(result.totalEarned).toBe(6);
  });

  it("unverified code below 6000 -> zero-credit", () => {
    const catalogue = mmlcvCatalogue([]);
    const p = plan({ currentSemester: 1 });
    const courses = [
      pc("c1", 1, "XXXX1234", 1, { unverified: true, level: 1000 }),
    ];
    const result = evaluate(p, courses, catalogue);
    const r = statusOf(result, "c1");
    expect(r.status).toBe("zero-credit");
    expect(r.messages).toContain(
      "Undergraduate course - can't count as a university elective",
    );
    expect(r.messages).toContain(
      "Unverified course code - not in the ANU catalogue we loaded",
    );
  });
});
