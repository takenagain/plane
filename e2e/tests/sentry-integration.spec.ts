/**
 * E2E Tests for Sentry Integration (Goal 3)
 *
 * Coverage:
 * 1. Admin sign-in → Workspace Settings → Integrations → Sentry card visible
 * 2. Connected workspace: state mapping section and add-mapping form
 * 3. API: signed webhook creates work item (no browser)
 *
 * Prerequisites:
 * - Plane stack at http://localhost:8081 (or PLAYWRIGHT_BASE_URL)
 * - API container reachable for django shell seed (docker/podman)
 * - Instance Sentry flags seeded via enableSentryInstanceConfig()
 */

import { test, expect, type Page } from "@playwright/test";
import {
  API_BASE_URL,
  BASE_URL,
  buildSentryAlertPayload,
  clearSentryWorkspaceConnection,
  enableSentryInstanceConfig,
  ensureE2ESeedData,
  seedSentryConnectionAndMapping,
  signInAndEnsureWorkspace,
  signInViaApi,
  signSentryWebhook,
  waitForPageLoad,
} from "./helpers/sentry-integration";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateToIntegrations(page: Page, slug: string) {
  const openIntegrations = async () => {
    await page.goto(`${BASE_URL}/${slug}/settings/integrations/`);
    await waitForPageLoad(page);
  };

  try {
    await signInViaApi(page);
  } catch {
    await signInAndEnsureWorkspace(page);
  }

  await openIntegrations();
  if (page.url().includes("/sign-in")) {
    await signInAndEnsureWorkspace(page);
    await openIntegrations();
  }

  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Sentry", exact: true })).toBeVisible({ timeout: 30_000 });
}

function sentryCard(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Sentry", exact: true }) })
    .first();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let workspaceSlug: string;
let projectId: string;

test.beforeAll(() => {
  const seed = ensureE2ESeedData();
  workspaceSlug = seed.workspaceSlug;
  projectId = seed.projectId;
  enableSentryInstanceConfig();
});

// ---------------------------------------------------------------------------
// UI tests
// ---------------------------------------------------------------------------

test.describe.serial("Sentry integration UI", () => {
  test.beforeEach(async ({ page }) => {
    enableSentryInstanceConfig();
    const slug = await signInAndEnsureWorkspace(page);
    if (slug) workspaceSlug = slug;
    clearSentryWorkspaceConnection(workspaceSlug);
  });

  test("shows Sentry card with Connect when disconnected", async ({ page }) => {
    await navigateToIntegrations(page, workspaceSlug);

    const card = sentryCard(page);
    await expect(card.getByText("Connect your Sentry workspace with Plane.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Connect" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Uninstall" })).not.toBeVisible();
  });

  test("shows state mapping UI when connected", async ({ page }) => {
    seedSentryConnectionAndMapping(workspaceSlug);
    await navigateToIntegrations(page, workspaceSlug);

    const card = sentryCard(page);
    await expect(card.getByText(`Connected Sentry workspaces: e2e-org`)).toBeVisible();
    await expect(card.getByRole("heading", { name: "State Mapping" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Uninstall" })).toBeVisible();
    await expect(card.getByText(/Webhook URL:/)).toBeVisible();
  });

  test("opens mapping form with placeholder fields", async ({ page }) => {
    const sentrySeed = seedSentryConnectionAndMapping(workspaceSlug);
    await navigateToIntegrations(page, workspaceSlug);

    const card = sentryCard(page);
    await card.getByRole("button", { name: "Add new state mapping" }).click();

    await expect(card.getByPlaceholder("Sentry project slug", { exact: true })).toBeVisible();
    await expect(card.getByPlaceholder("Plane project ID", { exact: true })).toBeVisible();
    await expect(card.getByPlaceholder("Unresolved state ID", { exact: true })).toBeVisible();
    await expect(card.getByPlaceholder("Resolved state ID", { exact: true })).toBeVisible();

    await card.getByPlaceholder("Sentry project slug", { exact: true }).fill("frontend");
    await card.getByPlaceholder("Plane project ID", { exact: true }).fill(projectId);
    await card.getByPlaceholder("Unresolved state ID", { exact: true }).fill(sentrySeed.unresolvedStateId);
    await card.getByPlaceholder("Resolved state ID", { exact: true }).fill(sentrySeed.resolvedStateId);

    await expect(card.getByPlaceholder("Plane project ID", { exact: true })).toHaveValue(projectId);
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByPlaceholder("Sentry project slug", { exact: true })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Webhook API (no browser)
// ---------------------------------------------------------------------------

test.describe("Sentry webhook API", () => {
  test("accepts signed alert payload and returns issue_id", async ({ request }) => {
    const sentrySeed = seedSentryConnectionAndMapping(workspaceSlug);
    const issueId = `e2e-${Date.now()}`;
    const payload = buildSentryAlertPayload(issueId, sentrySeed.sentryProjectSlug);
    const body = JSON.stringify(payload);
    const signature = signSentryWebhook(body, sentrySeed.webhookSecret);

    const response = await request.post(`${API_BASE_URL}/api/webhooks/sentry/?workspace=${workspaceSlug}`, {
      data: body,
      headers: {
        "Content-Type": "application/json",
        "Sentry-Hook-Signature": signature,
      },
    });

    expect(response.status()).toBe(201);
    const json = (await response.json()) as { issue_id?: string };
    expect(json.issue_id).toBeTruthy();
  });

  test("rejects invalid webhook signature", async ({ request }) => {
    seedSentryConnectionAndMapping(workspaceSlug);
    const payload = buildSentryAlertPayload("bad-sig", "backend");
    const body = JSON.stringify(payload);

    const response = await request.post(`${API_BASE_URL}/api/webhooks/sentry/?workspace=${workspaceSlug}`, {
      data: body,
      headers: {
        "Content-Type": "application/json",
        "Sentry-Hook-Signature": "sha256=deadbeef",
      },
    });

    expect(response.status()).toBe(403);
  });
});
