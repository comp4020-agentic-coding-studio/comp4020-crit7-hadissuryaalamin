// The crit spec's machine-checked line 3 ("the main flow survives a reload —
// create something, and it persists"), over real HTTP against the BUILT app
// (spec/global-setup.ts boots dist/server/entry.mjs). Each test creates its
// own plan via the real POST endpoints — no DB access, no shared fixtures —
// so tests stay independent and order-agnostic.
//
// Astro's default CSRF (same-origin) check rejects a POST with no Origin
// header ("Cross-site POST form submissions are forbidden", 403) — node's
// fetch doesn't send one automatically the way a browser form submit does,
// so every POST here sets `origin: baseUrl` (see spec/global-setup.ts).
//
// `redirect: "manual"` on every POST asserts the 303 and its Location
// header directly, instead of letting fetch silently follow it — the point
// of this suite is proving the PRG (post/redirect/get) contract, not just
// the end state. The follow-up GET is a fresh, independent request (a new
// `fetch` call, nothing carried over) — that IS the "reload" the spec line
// asks for.
//
// Assertions read the raw HTML text (`await res.text()`), not parsed DOM:
// status badges are upper-cased only by CSS (`text-transform`), so the raw
// markup has the mixed-case label text components render
// (`src/components/StatusBadge.astro`'s LABEL map) — e.g. "Zero credit", not
// "ZERO CREDIT". Astro escapes text content, so an apostrophe in rendered
// text comes through as `&#39;`, not `'` — checker.ts's UNDERGRAD_MESSAGE
// constant is asserted with that encoding.
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

interface CreatePlanInput {
  [key: string]: string;
  programCode: string;
  startYear: string;
  startSemester: string;
  currentSemester: string;
}

/** POSTs the home page's start-plan form. Manual redirect so the 303 and its
 * Location are directly assertable (epic.md section 10's PRG contract). */
async function postCreatePlan(input: CreatePlanInput): Promise<Response> {
  return fetch(`${baseUrl}/api/plans`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: baseUrl },
    body: new URLSearchParams(input),
  });
}

interface AddCourseInput {
  [key: string]: string;
  planId: string;
  semesterIndex: string;
  courseCode: string;
}

async function postAddCourse(input: AddCourseInput): Promise<Response> {
  return fetch(`${baseUrl}/api/plan-courses`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: baseUrl },
    body: new URLSearchParams({ intent: "add", from: "plan", ...input }),
  });
}

async function postRemoveCourse(planId: string, planCourseId: string, from = "plan"): Promise<Response> {
  return fetch(`${baseUrl}/api/plan-courses`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: baseUrl },
    body: new URLSearchParams({ intent: "remove", planId, planCourseId, from }),
  });
}

/** Creates an MMLCV plan (no specialisation slot — epic.md 15) and returns
 * its id, asserting the 303 lands where expected on the way. MMLCV has no
 * specialisation slot, so this helper never needs one. */
async function createMmlcvPlan(currentSemester: string): Promise<{ id: string; location: string }> {
  const res = await postCreatePlan({
    programCode: "MMLCV",
    startYear: "2026",
    startSemester: "1",
    currentSemester,
  });
  expect(res.status).toBe(303);
  const location = res.headers.get("location");
  if (!location) throw new Error("expected a Location header on plan creation");
  const match = location.match(/^\/plan\/([^/]+)/);
  if (!match) throw new Error(`expected a /plan/<id> redirect, got ${location}`);
  return { id: match[1]!, location };
}

/** Extracts the `planCourseId` hidden field from the remove form inside the
 * course card for `courseCode` — the id the DB assigned when it was added,
 * needed to remove that exact row. */
function planCourseIdFor(html: string, courseCode: string): string {
  const cardStart = html.indexOf(`>${courseCode}</span>`);
  expect(cardStart, `expected a course card for ${courseCode} in the page`).toBeGreaterThanOrEqual(0);
  const afterCard = html.slice(cardStart);
  const match = afterCard.match(/name="planCourseId" value="(\d+)"/);
  expect(match, `expected a planCourseId hidden field after ${courseCode}'s card`).not.toBeNull();
  return match![1]!;
}

describe("plan flow: create -> reload -> persists (crit spec line 3)", () => {
  it("creates at semester 1, adds a course, a fresh GET (reload) shows it, then removal removes it", async () => {
    const { id: planId, location: planPath } = await createMmlcvPlan("1");
    // Semester 1 is the very first semester — nothing to catch up on — so
    // creation should land straight on the plan page (epic.md section 10:
    // "redirects to /plan/<id>/catch-up if current_semester > 1, else
    // /plan/<id>"), not on catch-up.
    expect(planPath).toBe(`/plan/${planId}`);

    const addRes = await postAddCourse({ planId, semesterIndex: "1", courseCode: "COMP6710" });
    expect(addRes.status).toBe(303);
    expect(addRes.headers.get("location")).toBe(`/plan/${planId}`);

    // A brand-new, independent request — this is the "reload".
    const afterAdd = await fetch(`${baseUrl}${planPath}`);
    expect(afterAdd.status).toBe(200);
    const afterAddHtml = await afterAdd.text();
    expect(afterAddHtml).toContain("COMP6710");
    expect(afterAddHtml).toContain("Remove COMP6710");

    const planCourseId = planCourseIdFor(afterAddHtml, "COMP6710");
    const removeRes = await postRemoveCourse(planId, planCourseId);
    expect(removeRes.status).toBe(303);
    expect(removeRes.headers.get("location")).toBe(`/plan/${planId}`);

    // Another fresh reload: the course is gone.
    const afterRemove = await fetch(`${baseUrl}${planPath}`);
    expect(afterRemove.status).toBe(200);
    const afterRemoveHtml = await afterRemove.text();
    expect(afterRemoveHtml).not.toContain("Remove COMP6710");
  });

  it("creates at semester 3, which has past semesters to record, and lands on catch-up", async () => {
    const { id: planId, location: planPath } = await createMmlcvPlan("3");
    expect(planPath).toBe(`/plan/${planId}/catch-up`);

    const catchUpRes = await fetch(`${baseUrl}${planPath}`);
    expect(catchUpRes.status).toBe(200);
    const html = await catchUpRes.text();
    expect(html).toContain("Catch up on past semesters");
  });

  it("flags an undergraduate course added to an MMLCV plan as zero credit", async () => {
    const { id: planId, location: planPath } = await createMmlcvPlan("1");

    const addRes = await postAddCourse({ planId, semesterIndex: "1", courseCode: "COMP1100" });
    expect(addRes.status).toBe(303);

    const planRes = await fetch(`${baseUrl}${planPath}`);
    expect(planRes.status).toBe(200);
    const html = await planRes.text();
    expect(html).toContain("COMP1100");
    // Raw HTML text: StatusBadge's label is "Zero credit" (mixed case — CSS
    // upper-cases it for display, the markup itself doesn't).
    expect(html).toContain("Zero credit");
    // checker.ts's UNDERGRAD_MESSAGE, as Astro escapes it into the page
    // (apostrophe -> &#39;).
    expect(html).toContain("Undergraduate course - can&#39;t count as a university elective");
  });

  it("refuses to create an MCOMP plan with no specialisation, and does not redirect to a plan", async () => {
    const res = await postCreatePlan({
      programCode: "MCOMP",
      startYear: "2026",
      startSemester: "1",
      currentSemester: "1",
      // specialisation deliberately omitted
    });
    expect(res.status).toBe(303);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    // Bounced back to the home form, not to a newly created plan.
    expect(location).toMatch(/^\/\?/);
    expect(location).not.toMatch(/\/plan\//);

    const homeRes = await fetch(`${baseUrl}${location}`);
    expect(homeRes.status).toBe(200);
    const html = await homeRes.text();
    expect(html).toContain("specialisation is required for MCOMP 2026");
    // The re-rendered form keeps the student's other choices (PRG contract:
    // only the missing field's worth of typing is lost).
    expect(html).toContain('value="MCOMP" selected');
  });
});
