// Hand-written course-level overrides (epic.md 7.3): the two courses that
// must be completed twice, in consecutive semesters, to earn their full
// project/research unit value. The parser always emits repeatableTimes = 1
// (parse-course.ts has no way to see this from the course's own page — the
// "twice, in consecutive semesters" rule is stated on the PROGRAM page, not
// the course page).
//
// Source / exact sentence for each entry is given inline below. Read live
// 2026-09-24; identical wording appears on MCOMP, VCOMP and MMLCV program
// pages across 2025/2026/2027 wherever these courses are listed.
import type { CourseJson } from "../../scripts/scrape/types.ts";

interface CourseOverride {
  repeatableTimes: number;
  citation: string;
}

const COURSE_OVERRIDES: Record<string, CourseOverride> = {
  COMP8715: {
    repeatableTimes: 2,
    citation:
      'https://programsandcourses.anu.edu.au/2026/program/7706XMCOMP: "COMP8715 Advanced Computing Team Project, which must be completed twice, in consecutive semesters (6+6 units)"',
  },
  COMP8800: {
    repeatableTimes: 2,
    citation:
      'https://programsandcourses.anu.edu.au/2026/program/7722XVCOMP: "COMP8800 Advanced Computing Research Project, which must be taken twice, in consecutive semesters (12+12 units)"',
  },
};

export function applyCourseOverrides(course: CourseJson): CourseJson {
  const override = COURSE_OVERRIDES[course.code];
  if (!override) return course;
  return {
    ...course,
    repeatableTimes: override.repeatableTimes,
  };
}
