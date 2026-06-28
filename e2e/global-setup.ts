/* oxlint-disable no-await-in-loop */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE_URL = process.env.E2E_API_URL ?? "http://localhost:8010";
const COMPOSE_PROJECT = process.env.E2E_COMPOSE_PROJECT ?? "wrrw-e2e";
const REPO_ROOT = process.env.E2E_REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function waitForApi(maxAttempts = 60): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/instances/`, { method: "GET" });
      if (response.ok) return;
    } catch {
      // API not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`API did not become ready at ${API_BASE_URL}`);
}

function seedInstance(): void {
  execSync(
    `docker compose -f docker-compose-local.yml -p ${COMPOSE_PROJECT} exec -T api python manage.py shell < e2e/scripts/seed-instance.py`,
    { cwd: REPO_ROOT, stdio: "inherit", shell: "/bin/bash" }
  );
}

export default async function globalSetup(): Promise<void> {
  await waitForApi();
  seedInstance();
}
