import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    fixturePlanId: string;
  }
}

// Boot the BUILT server (the same artefact the Dockerfile runs) on a free
// port with a throwaway database, so the spec asserts what actually ships —
// not the dev server, and never your local data.
export default async function setup(project: TestProject): Promise<() => void> {
  const entry = "./dist/server/entry.mjs";
  if (!existsSync(entry)) {
    throw new Error(`${entry} not found — run \`pnpm test\`, which builds first`);
  }

  const port = await new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, () => {
      const address = probe.address() as AddressInfo;
      probe.close(() => resolve(address.port));
    });
  });

  const server = spawn("node", [entry], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_PATH: join(mkdtempSync(join(tmpdir(), "spec-db-")), "test.db"),
    },
    stdio: "ignore",
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    if (attempt >= 50) {
      server.kill();
      throw new Error(`server did not come up at ${baseUrl}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  project.provide("baseUrl", baseUrl);

  // Seed one fixture plan through the real form endpoint (not a DB insert)
  // so routes.ts (task 006) has a live /plan/<id> and /plan/<id>/catch-up
  // to assert against. MMLCV has no specialisation slot, keeping this POST
  // minimal.
  // "manual" redirect mode returns an opaque response per the fetch spec
  // (no readable Location, even same-origin) — instead let fetch follow the
  // 303 and read the final URL it landed on.
  // Astro's same-origin CSRF check (on by default for POST) requires an
  // Origin header equal to the request's own origin — a real browser form
  // submit always sends one, node's fetch doesn't add it automatically.
  const createRes = await fetch(`${baseUrl}/api/plans`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: baseUrl },
    body: new URLSearchParams({
      programCode: "MMLCV",
      startYear: "2026",
      startSemester: "1",
      currentSemester: "2",
    }),
  });
  const match = createRes.url.match(/\/plan\/([^/]+)/);
  if (!match) {
    server.kill();
    throw new Error(`fixture plan creation did not redirect to a plan id (landed on: ${createRes.url})`);
  }
  project.provide("fixturePlanId", match[1]!);

  return () => {
    server.kill();
  };
}
