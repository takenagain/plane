/* eslint-disable turbo/no-undeclared-env-vars */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { BASE_URL, API_BASE_URL, signInViaApi, waitForPageLoad } from "./time-tracking";

export const E2E_GITHUB_APP_NAME = process.env.E2E_GITHUB_APP_NAME || "plane-e2e-test";
export const E2E_GITHUB_WEBHOOK_SECRET = process.env.E2E_GITHUB_WEBHOOK_SECRET || "e2e-github-webhook-secret";

function detectContainerRuntime(): string {
  const envRuntime = process.env.CONTAINER_RUNTIME;
  if (envRuntime) return envRuntime;
  for (const runtime of ["podman", "docker"]) {
    try {
      execFileSync(runtime, ["--version"], { encoding: "utf-8", stdio: "pipe" });
      return runtime;
    } catch {
      // try next runtime
    }
  }
  throw new Error("Neither podman nor docker is available — required to enable GitHub E2E config");
}

function resolveApiContainerName(): { runtime: string; container: string } {
  const runtime = detectContainerRuntime();
  const output = execFileSync(runtime, ["ps", "--format", "{{.Names}}"], { encoding: "utf-8" });
  const names = output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  const container = names.find((name) => name === "api" || name.endsWith("_api_1")) || "api";
  return { runtime, container };
}

function runDjangoShell(script: string): string {
  const { runtime, container } = resolveApiContainerName();
  return execFileSync(runtime, ["exec", "-w", "/", container, "python", "/code/manage.py", "shell", "-c", script], {
    encoding: "utf-8",
    cwd: "/",
  });
}

/** Turn on GitHub sync + webhook secret in InstanceConfiguration for local E2E. */
export function ensureGithubE2EConfig(): void {
  if (process.env.E2E_SKIP_GITHUB_CONFIG === "true" || process.env.E2E_SKIP_GITHUB_CONFIG === "1") {
    return;
  }

  const appName = E2E_GITHUB_APP_NAME.replace(/"/g, '\\"');
  const webhookSecret = E2E_GITHUB_WEBHOOK_SECRET.replace(/"/g, '\\"');

  const script = `
from plane.license.models import InstanceConfiguration
from plane.license.utils.encryption import encrypt_data
from plane.integrations.ensure import ensure_integration_catalog

def upsert(key, value, is_encrypted=False):
    obj, _ = InstanceConfiguration.objects.get_or_create(key=key)
    obj.is_encrypted = is_encrypted
    obj.value = encrypt_data(value) if is_encrypted else value
    obj.save()

upsert("ENABLE_GITHUB_SYNC", "1")
upsert("GITHUB_APP_NAME", "${appName}")
upsert("GITHUB_WEBHOOK_SECRET", "${webhookSecret}", is_encrypted=True)
ensure_integration_catalog()
print("GITHUB_E2E_CONFIG_OK")
`;

  const output = runDjangoShell(script);
  if (!output.includes("GITHUB_E2E_CONFIG_OK")) {
    throw new Error(`Failed to configure GitHub E2E instance settings: ${output}`);
  }
}

export function integrationsPageUrl(workspaceSlug: string): string {
  return `${BASE_URL}/${workspaceSlug}/settings/integrations/`;
}

export async function navigateToWorkspaceIntegrations(page: Page, workspaceSlug: string): Promise<void> {
  await page.goto(integrationsPageUrl(workspaceSlug));
  await waitForPageLoad(page);
  await expect(page.getByRole("heading", { name: "Integrations", level: 3 })).toBeVisible({ timeout: 30_000 });
}

export function githubIntegrationCard(page: Page) {
  return page.locator("h3", { hasText: "GitHub" }).locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
}

export function signGithubWebhook(payload: string | Buffer, secret: string): string {
  const body = typeof payload === "string" ? payload : payload.toString("utf-8");
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export async function postGithubWebhook(
  request: APIRequestContext,
  payload: Record<string, unknown>,
  options?: { secret?: string; event?: string }
): Promise<{ status: number; body: unknown }> {
  const secret = options?.secret ?? E2E_GITHUB_WEBHOOK_SECRET;
  const event = options?.event ?? "ping";
  const rawBody = JSON.stringify(payload);
  const response = await request.post(`${API_BASE_URL}/api/webhooks/github/`, {
    data: rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-Hub-Signature-256": signGithubWebhook(rawBody, secret),
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => null);
  }

  return { status: response.status(), body };
}

export async function fetchIntegrationsCatalog(request: APIRequestContext) {
  const response = await request.get(`${API_BASE_URL}/api/integrations/`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Array<{ provider?: string; title?: string }>;
}

export async function fetchWorkspaceIntegrations(request: APIRequestContext, workspaceSlug: string) {
  const response = await request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/workspace-integrations/`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as unknown[];
}

export async function authenticatedApiSession(page: Page): Promise<void> {
  await signInViaApi(page);
}
