import { sql } from "drizzle-orm";
import { int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
//
// Catalogue tables (epic.md section 8): truncated and reloaded from
// data/catalogue/*.json + overrides at every server boot, inside one
// transaction. Never written to by the app itself.

export const programs = sqliteTable(
  "programs",
  {
    code: text().notNull(),
    year: int().notNull(),
    name: text().notNull(),
    totalUnits: int("total_units").notNull(),
    semesters: int().notNull(),
  },
  (table) => [primaryKey({ columns: [table.code, table.year] })],
);

// kind: "list" = units from named courses (see group_courses); "filter" =
// units from any course matching filterSubjects and/or filterMinLevel.
export const requirementGroups = sqliteTable("requirement_groups", {
  id: int().primaryKey({ autoIncrement: true }),
  programCode: text("program_code").notNull(),
  year: int().notNull(),
  position: int().notNull(),
  name: text().notNull(),
  kind: text({ enum: ["list", "filter"] }).notNull(),
  unitsRequired: int("units_required").notNull(),
  filterSubjects: text("filter_subjects", { mode: "json" }).$type<string[]>(),
  filterMinLevel: int("filter_min_level"),
  // e.g. "A" / "B" for a project-pathway group; null otherwise.
  pathway: text(),
  // epic.md 15: specialisation code (e.g. "ARTIF-SPEC") this group belongs
  // to; groups sharing a code are alternatives, null for a group that isn't
  // part of a specialisation choice.
  specialisation: text(),
  // epic.md 15 / checker-types.RequirementGroup.pathwayMarkers: marker
  // course codes that identify a pathway as "in use" (9.2 auto-detect).
  // Only meaningful when `pathway` is set.
  pathwayMarkers: text("pathway_markers", { mode: "json" }).$type<string[]>(),
});

export const groupCourses = sqliteTable(
  "group_courses",
  {
    groupId: int("group_id")
      .notNull()
      .references(() => requirementGroups.id),
    courseCode: text("course_code").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.courseCode] })],
);

export const courses = sqliteTable(
  "courses",
  {
    code: text().notNull(),
    year: int().notNull(),
    title: text().notNull(),
    units: int().notNull(),
    level: int().notNull(),
    offeredS1: int("offered_s1", { mode: "boolean" }).notNull(),
    offeredS2: int("offered_s2", { mode: "boolean" }).notNull(),
    offeringKnown: int("offering_known", { mode: "boolean" }).notNull(),
    prereqText: text("prereq_text"),
    // Parsed AND/OR expression tree over course codes, or null if the
    // requisite sentence couldn't be parsed safely (see epic.md 9.3).
    prereqExpr: text("prereq_expr", { mode: "json" }).$type<unknown>(),
    incompatible: text("incompatible", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    repeatableTimes: int("repeatable_times").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.code, table.year] })],
);

// Plan tables (student data, never truncated).

export const plans = sqliteTable("plans", {
  // Random URL-safe string, >=10 chars, generated with `crypto` at insert
  // time — see epic.md section 8.
  id: text().primaryKey(),
  programCode: text("program_code").notNull(),
  startYear: int("start_year").notNull(),
  startSemester: int("start_semester").notNull(),
  currentSemester: int("current_semester").notNull(),
  // epic.md 15 (D14): required for MCOMP/VCOMP (one of that program-year's
  // specialisations), null/ignored for MMLCV.
  specialisation: text(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const planCourses = sqliteTable("plan_courses", {
  id: int().primaryKey({ autoIncrement: true }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  semesterIndex: int("semester_index").notNull(),
  courseCode: text("course_code").notNull(),
  unverified: int({ mode: "boolean" }).notNull().default(false),
  units: int().notNull(),
  level: int().notNull(),
  addedAt: text("added_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type RequirementGroup = typeof requirementGroups.$inferSelect;
export type NewRequirementGroup = typeof requirementGroups.$inferInsert;
export type GroupCourse = typeof groupCourses.$inferSelect;
export type NewGroupCourse = typeof groupCourses.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanCourse = typeof planCourses.$inferSelect;
export type NewPlanCourse = typeof planCourses.$inferInsert;
