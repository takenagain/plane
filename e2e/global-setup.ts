/* oxlint-disable no-await-in-loop */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE_URL = process.env.E2E_API_URL ?? process.env.BASE_URL ?? "http://localhost:8010";
const COMPOSE_FILE =
  process.env.E2E_COMPOSE_FILE ?? (process.env.CI ? "docker-compose.yml" : "docker-compose-local.yml");
const COMPOSE_PROJECT = process.env.E2E_COMPOSE_PROJECT ?? (process.env.CI ? "" : "wrrw-e2e");
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

function resolveApiContainer(): string {
  const explicit = process.env.E2E_API_CONTAINER?.trim();
  if (explicit) return explicit;

  const output = execSync("docker ps --format {{.Names}}", { encoding: "utf-8" });
  const names = output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);

  const preferred = COMPOSE_PROJECT ? `${COMPOSE_PROJECT}-api-1` : null;

  return (
    (preferred && names.find((name) => name === preferred)) ||
    names.find((name) => name.endsWith("-api-1")) ||
    names.find((name) => name === "api" || name.endsWith("_api_1")) ||
    "api"
  );
}

function runSeedScript(scriptPath: string): void {
  const projectFlag = COMPOSE_PROJECT ? `-p ${COMPOSE_PROJECT}` : "";
  const composeCmd = `docker compose -f ${COMPOSE_FILE} ${projectFlag} exec -T api python manage.py shell < ${scriptPath}`;

  try {
    execSync(composeCmd, { cwd: REPO_ROOT, stdio: "inherit", shell: "/bin/bash" });
    return;
  } catch {
    const container = resolveApiContainer();
    execSync(`docker exec -i ${container} python /code/manage.py shell < ${scriptPath}`, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: "/bin/bash",
    });
  }
}

function seedInstance(): void {
  runSeedScript("e2e/scripts/seed-instance.py");
  runSeedScript("e2e/scripts/seed-admin-mfa.py");
}

export default async function globalSetup(): Promise<void> {
  await waitForApi();
  seedInstance();
}
