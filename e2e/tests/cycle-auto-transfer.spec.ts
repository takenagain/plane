/**
 * E2E Tests for Auto-transfer cycle work items (Goal 4)
 *
 * Extends cycle-automation.spec.ts with:
 * - Structured navigation via test.step (login → automations → cycles)
 * - Both toggles enabled and cycles module reachable
 * - Backend verification via Django shell (no Celery beat / time travel in browser)
 *
 * Full daily Celery transfer in-browser would require waiting for cycle end dates or
 * mocking time; unit tests cover process_cycle_automations. Shell invocation mirrors
 * recurring-work-item.spec.ts.
 */

import { test, expect } from "@playwright/test";
import { ensureE2ESeedData, signInAndEnsureWorkspace } from "./helpers/time-tracking";
import {
  automationToggle,
  enableBothAutomationToggles,
  ensureProjectCyclesEnabled,
  getIssueCycleId,
  invokeProcessCycleAutomations,
  navigateToAutomations,
  navigateToCycles,
  resetAutomationTogglesToOff,
  resetCycleAutomationBackend,
  seedEndedCycleWithIncompleteIssue,
  setProjectAutomationFlags,
  countProjectCycles,
} from "./helpers/cycle-automation";

let workspaceSlug: string;
let projectId: string;

test.beforeAll(() => {
  const seed = ensureE2ESeedData();
  workspaceSlug = seed.workspaceSlug;
  projectId = seed.projectId;
  ensureProjectCyclesEnabled(projectId);
});

async function signInResetAutomations(page: import("@playwright/test").Page): Promise<void> {
  await signInAndEnsureWorkspace(page);
  await navigateToAutomations(page, workspaceSlug, projectId);
  await resetAutomationTogglesToOff(page);
}

test.describe("Cycle auto-transfer backend (shell)", () => {
  test.beforeEach(() => {
    resetCycleAutomationBackend(projectId);
  });

  test.afterEach(() => {
    resetCycleAutomationBackend(projectId);
  });

  test("process_cycle_automations transfers incomplete issue when both toggles on", async ({ page }) => {
    const cyclesBefore = countProjectCycles(projectId);
    const { endedCycleId, issueId } = seedEndedCycleWithIncompleteIssue(projectId);
    expect(countProjectCycles(projectId)).toBe(cyclesBefore + 1);

    setProjectAutomationFlags(projectId, {
      auto_create_cycles: true,
      auto_transfer_cycle_issues: true,
    });

    await test.step("Sign in and confirm automations UI reflects backend flags", async () => {
      await signInAndEnsureWorkspace(page);
      await navigateToAutomations(page, workspaceSlug, projectId);
      await expect(automationToggle(page, "Auto-create cycles")).toHaveAttribute("aria-checked", "true", {
        timeout: 15_000,
      });
      await expect(automationToggle(page, "Auto-transfer work items")).toHaveAttribute("aria-checked", "true", {
        timeout: 15_000,
      });
    });

    await test.step("Run cycle automation task synchronously (no Celery beat)", async () => {
      invokeProcessCycleAutomations();
    });

    await test.step("Verify issue moved off ended cycle", async () => {
      const newCycleId = getIssueCycleId(issueId);
      expect(newCycleId).not.toBe(endedCycleId);
      expect(countProjectCycles(projectId)).toBeGreaterThan(1);
    });
  });
});

test.describe.serial("Cycle auto-transfer UI", () => {
  test.beforeEach(async ({ page }) => {
    resetCycleAutomationBackend(projectId);
    await signInResetAutomations(page);
  });

  test.afterEach(async ({ page }) => {
    resetCycleAutomationBackend(projectId);
    await signInResetAutomations(page);
  });

  test("enables both toggles and navigates to cycles view", async ({ page }) => {
    await test.step("Sign in and open project automations", async () => {
      await signInAndEnsureWorkspace(page);
      await navigateToAutomations(page, workspaceSlug, projectId);
    });

    await test.step("Enable auto-create and auto-transfer toggles", async () => {
      await enableBothAutomationToggles(page);
      await expect(automationToggle(page, "Auto-create cycles")).toHaveAttribute("aria-checked", "true");
      await expect(automationToggle(page, "Auto-transfer work items")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText(/transfer incomplete work items to the next cycle/i)).toBeVisible();
    });

    await test.step("Open project cycles list", async () => {
      await navigateToCycles(page, workspaceSlug, projectId);
      await expect(page.getByRole("link", { name: "Cycles" }).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: /add cycle/i }).first()).toBeVisible({ timeout: 30_000 });
    });
  });
});
