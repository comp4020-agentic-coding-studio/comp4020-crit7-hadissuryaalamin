import { inject } from "vitest";

const fixturePlanId = inject("fixturePlanId");

export const ROUTES = ["/", "/readme/", `/plan/${fixturePlanId}`, `/plan/${fixturePlanId}/catch-up`];
