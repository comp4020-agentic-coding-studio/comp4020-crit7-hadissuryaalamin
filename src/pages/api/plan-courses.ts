// POST /api/plan-courses — add or remove a course on a plan, shared by the
// plan page and the catch-up page (epic.md section 6, PRG). "from" says
// which page to bounce back to; a PlanValidationError bounces back with an
// "error" query param instead of a 500, so a typo'd course code or a bad
// semester never breaks the page.
import type { APIRoute } from "astro";
import { addCourse, removeCourse, PlanValidationError } from "../../lib/plans";

export const prerender = false;

function destination(from: string, planId: string): string {
  return from === "catchup" ? `/plan/${planId}/catch-up` : `/plan/${planId}`;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const planId = String(form.get("planId") ?? "");
  const from = String(form.get("from") ?? "plan");
  const back = destination(from, planId);

  if (!planId) return redirect("/?error=" + encodeURIComponent("Missing plan id."), 303);

  try {
    if (intent === "add") {
      const semesterIndex = Number.parseInt(String(form.get("semesterIndex") ?? ""), 10);
      const courseCode = String(form.get("courseCode") ?? "");
      if (!courseCode.trim()) {
        return redirect(`${back}?error=${encodeURIComponent("Enter a course code.")}`, 303);
      }
      addCourse(planId, semesterIndex, courseCode);
      return redirect(back, 303);
    }
    if (intent === "remove") {
      const planCourseId = Number.parseInt(String(form.get("planCourseId") ?? ""), 10);
      if (Number.isInteger(planCourseId)) {
        removeCourse(planId, planCourseId);
      }
      return redirect(back, 303);
    }
    return redirect(`${back}?error=${encodeURIComponent("Unknown action.")}`, 303);
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return redirect(`${back}?error=${encodeURIComponent(error.message)}`, 303);
    }
    throw error;
  }
};
