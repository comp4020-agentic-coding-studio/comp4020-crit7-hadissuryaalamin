// Plan data access (src/lib/plans.ts), against a real temp SQLite DB — not
// the built-server HTTP tests in spec/global-setup.ts. src/lib/db.ts reads
// DATABASE_PATH at import time (module top level), so the temp path has to
// be set *before* src/lib/plans.ts (which imports src/lib/db.ts) is first
// imported — a dynamic import in beforeAll, same temp-dir pattern as
// spec/global-setup.ts.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let plansMod: typeof import("../src/lib/plans");

beforeAll(async () => {
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "plans-test-")), "test.db");
  plansMod = await import("../src/lib/plans");
});

describe("createPlan / getPlan", () => {
  it("creates a plan with a real id and reads it back", () => {
    const plan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
    });
    expect(plan.id.length).toBeGreaterThanOrEqual(10);
    expect(plan.programCode).toBe("MMLCV");
    expect(plan.specialisation).toBeNull();

    const found = plansMod.getPlan(plan.id);
    expect(found?.plan.id).toBe(plan.id);
    expect(found?.courses).toEqual([]);
  });

  it("rejects an unknown program-year", () => {
    expect(() =>
      plansMod.createPlan({
        programCode: "MMLCV",
        startYear: 1999,
        startSemester: 1,
        currentSemester: 1,
      }),
    ).toThrow(plansMod.PlanValidationError);
  });

  it("rejects a start semester outside 1|2", () => {
    expect(() =>
      plansMod.createPlan({
        programCode: "MMLCV",
        startYear: 2026,
        startSemester: 3 as unknown as number,
        currentSemester: 1,
      }),
    ).toThrow(plansMod.PlanValidationError);
  });

  it("rejects a currentSemester outside the program's range", () => {
    expect(() =>
      plansMod.createPlan({
        programCode: "MMLCV",
        startYear: 2026,
        startSemester: 1,
        currentSemester: 5, // MMLCV is 4 semesters (2 years * 2, D13)
      }),
    ).toThrow(plansMod.PlanValidationError);
  });

  it("requires a valid specialisation for MCOMP, and stores it", () => {
    expect(() =>
      plansMod.createPlan({
        programCode: "MCOMP",
        startYear: 2026,
        startSemester: 1,
        currentSemester: 1,
      }),
    ).toThrow(plansMod.PlanValidationError);

    expect(() =>
      plansMod.createPlan({
        programCode: "MCOMP",
        startYear: 2026,
        startSemester: 1,
        currentSemester: 1,
        specialisation: "NOT-A-REAL-SPEC",
      }),
    ).toThrow(plansMod.PlanValidationError);

    const plan = plansMod.createPlan({
      programCode: "MCOMP",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
      specialisation: "ARTIF-SPEC",
    });
    expect(plan.specialisation).toBe("ARTIF-SPEC");
  });

  it("ignores a specialisation given for MMLCV rather than rejecting it", () => {
    const plan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
      specialisation: "ARTIF-SPEC",
    });
    expect(plan.specialisation).toBeNull();
  });
});

describe("addCourse / removeCourse", () => {
  it("adds a known catalogue course as verified, with catalogue level/units", () => {
    const plan = plansMod.createPlan({
      programCode: "MCOMP",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
      specialisation: "ARTIF-SPEC",
    });
    // COMP6120 is in MCOMP 2026's compulsory list (data/catalogue/programs.json).
    const course = plansMod.addCourse(plan.id, 1, "COMP6120");
    expect(course.unverified).toBe(false);
    expect(course.courseCode).toBe("COMP6120");
    expect(course.level).toBe(6000);
    expect(course.units).toBeGreaterThan(0);
  });

  it("adds an unknown typed code as unverified, level from code, 6 units", () => {
    const plan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
    });
    const course = plansMod.addCourse(plan.id, 1, "COMP9999");
    expect(course.unverified).toBe(true);
    expect(course.level).toBe(9000);
    expect(course.units).toBe(6);
  });

  it("removes a course", () => {
    const plan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
    });
    const course = plansMod.addCourse(plan.id, 1, "COMP1100");
    expect(plansMod.getPlan(plan.id)?.courses).toHaveLength(1);

    plansMod.removeCourse(plan.id, course.id);
    expect(plansMod.getPlan(plan.id)?.courses).toHaveLength(0);
  });

  it("new courses start with prereqWaived false, and setPrereqWaived toggles it, scoped to the plan", () => {
    const plan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
    });
    const otherPlan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
    });
    const course = plansMod.addCourse(plan.id, 1, "COMP8539");
    expect(course.prereqWaived).toBe(false);

    plansMod.setPrereqWaived(plan.id, course.id, true);
    expect(plansMod.getPlan(plan.id)?.courses[0]?.prereqWaived).toBe(true);

    // Scoped to planId — another plan can't waive this row.
    plansMod.setPrereqWaived(otherPlan.id, course.id, false);
    expect(plansMod.getPlan(plan.id)?.courses[0]?.prereqWaived).toBe(true);

    plansMod.setPrereqWaived(plan.id, course.id, false);
    expect(plansMod.getPlan(plan.id)?.courses[0]?.prereqWaived).toBe(false);
  });
});

describe("evaluatePlan", () => {
  it("returns null for an unknown plan id", () => {
    expect(plansMod.evaluatePlan("not-a-real-plan-id")).toBeNull();
  });

  it("flags an undergrad course as zero-credit on an MMLCV plan", () => {
    const plan = plansMod.createPlan({
      programCode: "MMLCV",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
    });
    plansMod.addCourse(plan.id, 1, "COMP1100");

    const result = plansMod.evaluatePlan(plan.id)!;
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.status).toBe("zero-credit");
  });

  it("gives an MCOMP plan with a specialisation only that specialisation's groups", () => {
    const plan = plansMod.createPlan({
      programCode: "MCOMP",
      startYear: 2026,
      startSemester: 1,
      currentSemester: 1,
      specialisation: "ARTIF-SPEC",
    });

    const result = plansMod.evaluatePlan(plan.id)!;
    const groupNames = result.groups.map((g) => g.name);
    // ARTIF-SPEC's own group is present...
    expect(groupNames).toContain("Specialisation courses");
    // ...and no other specialisation contributed a group, so the total
    // required units is the real per-program-year total (96), not more.
    expect(result.totalRequired).toBe(96);

    // A course from a *different* specialisation (e.g. a Software
    // Development-only code) never appears as a fillable group here —
    // proven indirectly: the specialisation groups sum to at most 24 units
    // (one specialisation's worth), not several stacked together.
    const specialisationUnits = result.groups
      .filter((g) => g.name === "Specialisation courses")
      .reduce((sum, g) => sum + g.required, 0);
    expect(specialisationUnits).toBeLessThanOrEqual(24);
  });
});
