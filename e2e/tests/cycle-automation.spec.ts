/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
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

import { test, expect, type Page, type Locator } from "@playwright/test";
import { ensureE2ESeedData, signInAndEnsureWorkspace, waitForPageLoad, BASE_URL } from "./helpers/time-tracking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Locate the automation section that contains the given heading text. */
function automationSection(page: Page, title: string): Locator {
  return page.locator("div").filter({ has: page.locator(`h4:text-is("${title}")`) });
}

/** Get the toggle switch (role="switch") inside an automation section. */
function automationToggle(page: Page, title: string): Locator {
  return automationSection(page, title).getByRole("switch").first();
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
});

async function navigateToAutomations(page: Page) {
  await page.goto(`${BASE_URL}/${workspaceSlug}/settings/projects/${projectId}/automations/`);
  await waitForPageLoad(page);
  // Wait for the automation page content to be visible
  await expect(page.locator("h4:text-is('Auto-create cycles')")).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Cycle automation settings", () => {
  test.beforeEach(async ({ page }) => {
    await signInAndEnsureWorkspace(page);
  });

  test("auto-create toggle exists and is off by default", async ({ page }) => {
    await navigateToAutomations(page);

    const toggle = automationToggle(page, "Auto-create cycles");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("auto-transfer toggle is disabled when auto-create is off", async ({ page }) => {
    await navigateToAutomations(page);

    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeVisible();
    await expect(transferToggle).toBeDisabled();
  });

  test("enabling auto-create makes auto-transfer toggle interactive", async ({ page }) => {
    await navigateToAutomations(page);

    // Enable auto-create
    const createToggle = automationToggle(page, "Auto-create cycles");
    await createToggle.click();
    await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });

    // Auto-transfer should now be enabled (clickable)
    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
    await expect(transferToggle).toHaveAttribute("aria-checked", "false");
  });

  test("disabling auto-create also disables auto-transfer", async ({ page }) => {
    await navigateToAutomations(page);

    // Enable auto-create first
    const createToggle = automationToggle(page, "Auto-create cycles");
    if ((await createToggle.getAttribute("aria-checked")) !== "true") {
      await createToggle.click();
      await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    }

    // Enable auto-transfer
    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
    await transferToggle.click();
    await expect(transferToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });

    // Now disable auto-create — auto-transfer should also turn off
    await createToggle.click();
    await expect(createToggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
    await expect(transferToggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
    await expect(transferToggle).toBeDisabled({ timeout: 10_000 });
  });

  test("toggle states persist across page reload", async ({ page }) => {
    await navigateToAutomations(page);

    // Enable auto-create
    const createToggle = automationToggle(page, "Auto-create cycles");
    if ((await createToggle.getAttribute("aria-checked")) !== "true") {
      await createToggle.click();
      await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    }

    // Enable auto-transfer
    const transferToggle = automationToggle(page, "Auto-transfer work items");
    await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
    if ((await transferToggle.getAttribute("aria-checked")) !== "true") {
      await transferToggle.click();
      await expect(transferToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    }

    // Reload and verify both are still on
    await page.reload();
    await waitForPageLoad(page);
    await expect(page.locator("h4:text-is('Auto-create cycles')")).toBeVisible({ timeout: 15_000 });

    await expect(automationToggle(page, "Auto-create cycles")).toHaveAttribute("aria-checked", "true", {
      timeout: 10_000,
    });
    await expect(automationToggle(page, "Auto-transfer work items")).toHaveAttribute("aria-checked", "true", {
      timeout: 10_000,
    });

    // Clean up — disable both for other tests
    await automationToggle(page, "Auto-create cycles").click();
    await expect(automationToggle(page, "Auto-create cycles")).toHaveAttribute("aria-checked", "false", {
      timeout: 10_000,
    });
  });
});
