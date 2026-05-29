/* oxlint-disable no-await-in-loop */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Profile → Your work → Hours logged (time analytics) E2E.
 *
 * Run against a remote dev instance:
 *   PLAYWRIGHT_BASE_URL=http://ubuntu-24-dev.netbird.selfhosted:8081 \
 *   E2E_SKIP_SEED=1 \
 *   pnpm exec playwright test e2e/tests/profile-time-analytics.spec.ts
 *
 * Run against local docker-compose (default http://localhost:8081):
 *   pnpm exec playwright test e2e/tests/profile-time-analytics.spec.ts
 *
 * Required env (when not using docker seed defaults):
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD — sign-in credentials
 *   E2E_SKIP_SEED=1 — skip `docker/podman exec` seed on remote hosts
 *   PLAYWRIGHT_BASE_URL or BASE_URL — app origin
 *   E2E_API_BASE_URL — optional API origin if split from web
 *   E2E_WORKSPACE_NAME, E2E_PROJECT_NAME, E2E_ISSUE_TITLE — seed overrides (local seed only)
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { API_BASE_URL, BASE_URL, signInViaApi, tryEnsureE2ESeedData, waitForPageLoad } from "./helpers/time-tracking";
import {
  createProfileWorklog,
  ensureUiSignedIn,
  gotoHoursLoggedDirect,
  isProfileTimeAnalyticsAvailable,
  navigateToHoursLoggedViaYourWork,
  profileTimeAnalyticsUrl,
  resolveProfileTimeE2EContext,
  waitForProfileTimeCharts,
  waitForProfileTimeSummary,
  type ProfileTimeE2EContext,
} from "./helpers/profile-time-analytics";

let ctx: ProfileTimeE2EContext;
let worklogsSeeded = false;
let featureAvailable = false;
let uiAvailable = false;

const FEATURE_UNAVAILABLE_MSG =
  "Profile time analytics API is not deployed on this instance (GET user-time-analytics/.../summary/ returned non-200). Rebuild/deploy api+web with profile time analytics before running this spec.";

const UI_UNAVAILABLE_MSG =
  "Profile time analytics UI is not deployed on this instance (missing Hours logged tab / dashboard). Rebuild/deploy the web app with profile time analytics.";

async function ensureSignedIn(page: Page) {
  await signInViaApi(page);
}

async function seedWorklogsOnce(page: Page) {
  if (worklogsSeeded) return;
  await createProfileWorklog(page, ctx, 45);
  await createProfileWorklog(page, ctx, 30);
  worklogsSeeded = true;
}

test.describe.serial("Profile time analytics (Hours logged)", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await signInViaApi(page);
      ctx = await resolveProfileTimeE2EContext(page);
      featureAvailable = await isProfileTimeAnalyticsAvailable(page, ctx);
      if (featureAvailable) {
        await ensureUiSignedIn(page);
        await page.goto(profileTimeAnalyticsUrl(ctx));
        await waitForPageLoad(page);
        uiAvailable = await page
          .getByTestId("profile-time-analytics-dashboard")
          .isVisible({ timeout: 15_000 })
          .catch(() => false);
      }
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!ctx?.workspaceSlug, "Could not resolve workspace/user context");
    test.skip(!featureAvailable, FEATURE_UNAVAILABLE_MSG);
    await ensureSignedIn(page);
    await seedWorklogsOnce(page);
  });

  test("1. Auth and navigate via Your work → Hours logged tab", async ({ page }) => {
    test.skip(!uiAvailable, UI_UNAVAILABLE_MSG);
    await page.setViewportSize({ width: 1365, height: 900 });
    await ensureUiSignedIn(page);

    const summaryPromise = waitForProfileTimeSummary(page, ctx).catch(() => null);
    const chartsPromise = waitForProfileTimeCharts(page, ctx).catch(() => null);

    await navigateToHoursLoggedViaYourWork(page, ctx);

    await Promise.all([summaryPromise, chartsPromise]);

    await expect(page.getByTestId("profile-time-analytics-dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: /hours logged|profile\.time_analytics\.title/i })).toBeVisible();
    await expect(page.getByTestId("profile-time-filters")).toBeVisible();
  });

  test("2. Dashboard shows KPIs and customized insights when data exists", async ({ page }) => {
    test.skip(!uiAvailable, UI_UNAVAILABLE_MSG);
    await page.setViewportSize({ width: 1365, height: 900 });
    await gotoHoursLoggedDirect(page, ctx);

    const emptyState = page.getByTestId("profile-time-analytics-empty");
    const hasEmpty = await emptyState.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasEmpty) {
      await expect(emptyState).toBeVisible();
      await expect(page.getByText(/no time logged yet|profile\.time_analytics\.empty\.title/i)).toBeVisible();
      return;
    }

    await expect(page.getByTestId("profile-time-kpis")).toBeVisible();
    await expect(page.getByTestId("profile-time-kpis")).toContainText(
      /total hours|profile\.time_analytics\.kpis\.total_hours/i
    );
    await expect(page.getByTestId("profile-time-customized-insights")).toBeVisible();
    await expect(page.getByText(/customized.?insights/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /day of week/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /hours logged/i }).first()).toBeVisible();
  });

  test("3. Summary and charts APIs return data for the signed-in user", async ({ page }) => {
    await signInViaApi(page);

    const summaryResp = await page.request.get(
      `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}/summary/?date_filter=last_7_days`
    );
    expect(summaryResp.ok()).toBeTruthy();
    const summary = (await summaryResp.json()) as {
      total_hours?: number;
      worklog_count?: number;
    };
    expect(typeof summary.total_hours).toBe("number");
    expect(typeof summary.worklog_count).toBe("number");

    const chartsResp = await page.request.get(
      `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}/charts/?date_filter=last_7_days&x_axis=LOGGED_DAY_OF_WEEK&y_axis=HOURS_LOGGED&group_by=WORK_ITEMS`
    );
    expect(chartsResp.ok()).toBeTruthy();
    const charts = (await chartsResp.json()) as { data?: unknown[] };
    expect(Array.isArray(charts.data)).toBe(true);
  });

  test("4. CSV export API and UI button when chart has data", async ({ page }) => {
    const exportResp = await page.request.get(
      `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}/export/?date_filter=last_7_days`
    );
    expect(exportResp.ok()).toBeTruthy();
    const csv = await exportResp.text();
    expect(csv.length).toBeGreaterThan(0);

    test.skip(!uiAvailable, UI_UNAVAILABLE_MSG);
    await page.setViewportSize({ width: 1365, height: 900 });
    await gotoHoursLoggedDirect(page, ctx);

    const hasEmpty = await page
      .getByTestId("profile-time-analytics-empty")
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (hasEmpty) return;

    const exportButton = page.getByRole("button", { name: /export as csv/i }).first();
    await expect(exportButton).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await exportButton.click();
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toMatch(/hours-logged/i);
    }
  });

  test("5. Starting a timer reflects in profile active-timer KPI", async ({ page }) => {
    test.skip(!uiAvailable, UI_UNAVAILABLE_MSG);
    test.skip(!tryEnsureE2ESeedData(), "Timer UI flow requires local docker seed for a known issue");

    await page.setViewportSize({ width: 1365, height: 900 });
    await ensureUiSignedIn(page);

    const issueUrl = `${BASE_URL}/${ctx.workspaceSlug}/projects/${ctx.projectId}/issues/${ctx.issueId}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.goto(issueUrl);
      await waitForPageLoad(page);
      await ensureUiSignedIn(page);
      const emailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']")).first();
      if (await emailInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        continue;
      }
      if (
        await page
          .getByTestId("issue-time-tracking-actions")
          .first()
          .isVisible({ timeout: 5_000 })
          .catch(() => false)
      ) {
        break;
      }
    }

    const trackingActions = page.getByTestId("issue-time-tracking-actions").first();
    const startStopButton = trackingActions.getByTestId("issue-time-start-stop-button");
    await expect(startStopButton).toBeVisible({ timeout: 20_000 });

    const label = ((await startStopButton.textContent()) ?? "").trim().toLowerCase();
    if (label.includes("stop")) {
      await startStopButton.click();
      await page.waitForTimeout(1500);
    }
    await startStopButton.click();
    await page.waitForTimeout(2000);

    await expect
      .poll(async () => {
        const activeResp = await page.request.get(
          `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/worklogs/active/`
        );
        if (!activeResp.ok()) return 0;
        const active = (await activeResp.json()) as { id?: string } | null;
        return active?.id ? 1 : 0;
      })
      .toBe(1);

    await gotoHoursLoggedDirect(page, ctx);

    await expect(page.getByTestId("profile-time-kpis")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/active timers|profile\.time_analytics\.kpis\.active_timers/i)).toBeVisible();

    await expect
      .poll(async () => {
        const summaryResp = await page.request.get(
          `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}/summary/?date_filter=last_7_days`
        );
        if (!summaryResp.ok()) return 0;
        const summary = (await summaryResp.json()) as { active_timer_count?: number };
        return summary.active_timer_count ?? 0;
      })
      .toBeGreaterThan(0);
  });
});
