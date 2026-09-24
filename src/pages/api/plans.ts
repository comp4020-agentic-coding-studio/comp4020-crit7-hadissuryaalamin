// POST /api/plans — create a plan from the home form, then PRG (epic.md
// section 6): redirect to GET so a reload never resubmits. Success goes to
// the catch-up page first (a brand-new plan has no courses yet); a
// PlanValidationError round-trips back to "/" with the message and the
// submitted values kept as query params, so the form re-renders unchanged
// except for the error — no JS needed for any of this.
import type { APIRoute } from "astro";
import { createPlan, PlanValidationError } from "../../lib/plans";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const raw = {
    programCode: String(form.get("programCode") ?? ""),
    startYear: String(form.get("startYear") ?? ""),
    startSemester: String(form.get("startSemester") ?? ""),
    currentSemester: String(form.get("currentSemester") ?? ""),
    specialisation: String(form.get("specialisation") ?? ""),
  };

  function backToForm(message: string): Response {
    const params = new URLSearchParams({ error: message, ...raw });
    return redirect(`/?${params.toString()}`, 303);
  }

  const startYear = Number.parseInt(raw.startYear, 10);
  const startSemester = Number.parseInt(raw.startSemester, 10);
  const currentSemester = Number.parseInt(raw.currentSemester, 10);
  if (!raw.programCode) return backToForm("Choose a program.");
  if (!Number.isInteger(startYear)) return backToForm("Choose the year you started.");
  if (!Number.isInteger(currentSemester)) {
    return backToForm("Enter the semester you're enrolling in now.");
  }

  try {
    const plan = createPlan({
      programCode: raw.programCode,
      startYear,
      startSemester,
      currentSemester,
      specialisation: raw.specialisation || null,
    });
    return redirect(`/plan/${plan.id}/catch-up`, 303);
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return backToForm(error.message);
    }
    throw error;
  }
};
