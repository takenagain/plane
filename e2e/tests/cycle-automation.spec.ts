/**
 * E2E Tests for Cycle Automation Settings
 *
 * Coverage:
 * 1. Auto-create cycles toggle is visible and off by default.
 * 2. Enabling auto-create makes auto-transfer toggle interactive.
 * 3. Disabling auto-create also disables auto-transfer.
 * 4. Both toggles persist their state across page reloads.
 *
 * Prerequisites:
 * - Podman containers running via docker-compose.yml / podman-compose.
 * - Plane accessible at http://localhost:8081 (or BASE_URL env var).
 */

import { test, expect, type Page } from "@playwright/test";
import { ensureE2ESeedData, signInAndEnsureWorkspace, waitForPageLoad } from "./helpers/time-tracking";
import {
  automationToggle,
  clickToggleAndWait,
  navigateToAutomations,
  resetCycleAutomationBackend,
} from "./helpers/cycle-automation";

let workspaceSlug: string;
let projectId: string;

test.beforeAll(() => {
  const seed = ensureE2ESeedData();
  workspaceSlug = seed.workspaceSlug;
  projectId = seed.projectId;
});

async function signInAndOpenAutomations(page: Page): Promise<void> {
  await test.step("Sign in and ensure workspace", async () => {
    await signInAndEnsureWorkspace(page);
  });
  await test.step("Open project automations settings", async () => {
    await navigateToAutomations(page, workspaceSlug, projectId);
  });
}

test.describe.serial("Cycle automation settings", () => {
  test.beforeEach(async ({ page }) => {
    resetCycleAutomationBackend(projectId);
    await signInAndOpenAutomations(page);
  });

  test.afterEach(() => {
    resetCycleAutomationBackend(projectId);
  });

  test("auto-create toggle exists and is off by default", async ({ page }) => {
    const toggle = automationToggle(page, "Auto-create cycles");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("auto-transfer toggle is disabled when auto-create is off", async ({ page }) => {
    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeVisible();
    await expect(transferToggle).toBeDisabled();
  });

  test("enabling auto-create makes auto-transfer toggle interactive", async ({ page }) => {
    const createToggle = automationToggle(page, "Auto-create cycles");
    await clickToggleAndWait(page, createToggle);
    await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });

    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
    await expect(transferToggle).toHaveAttribute("aria-checked", "false");
  });

  test("disabling auto-create also disables auto-transfer", async ({ page }) => {
    const createToggle = automationToggle(page, "Auto-create cycles");
    if ((await createToggle.getAttribute("aria-checked")) !== "true") {
      await clickToggleAndWait(page, createToggle);
      await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    }

    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
    await clickToggleAndWait(page, transferToggle);
    await expect(transferToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });

    await clickToggleAndWait(page, createToggle);
    await expect(createToggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
    await expect(transferToggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
    await expect(transferToggle).toBeDisabled({ timeout: 10_000 });
  });

  test("toggle states persist across page reload", async ({ page }) => {
    const createToggle = automationToggle(page, "Auto-create cycles");
    if ((await createToggle.getAttribute("aria-checked")) !== "true") {
      await clickToggleAndWait(page, createToggle);
      await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    }

    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
    if ((await transferToggle.getAttribute("aria-checked")) !== "true") {
      await clickToggleAndWait(page, transferToggle);
      await expect(transferToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    }

    await page.reload();
    await waitForPageLoad(page);
    await expect(page.locator("h4:text-is('Auto-create cycles')")).toBeVisible({ timeout: 30_000 });

    await expect(automationToggle(page, "Auto-create cycles")).toHaveAttribute("aria-checked", "true", {
      timeout: 10_000,
    });
    await expect(automationToggle(page, "Auto-transfer work items")).toHaveAttribute("aria-checked", "true", {
      timeout: 10_000,
    });
  });
});
