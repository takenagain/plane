/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * E2E tests for Analytics: Hours Logged chart & CSV export.
 *
 * This focuses on:
 * - Ensuring the HOURS_LOGGED analytics endpoint returns chart data.
 * - Ensuring the time-logged CSV export includes the expected columns and non-zero hours.
 *
 * It reuses the seeding and auth helpers from the main time-tracking E2E spec.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  API_BASE_URL,
  BASE_URL,
  ensureE2ESeedData,
  signInAndEnsureWorkspace,
  signInViaApi,
} from "./helpers/time-tracking";

let workspaceSlug = "";
let projectId = "";
let issueId = "";
let analyticsSeeded = false;

async function createWorklog(page: Page, minutes: number) {
  const path = `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
  const resp = await page.request.post(`${API_BASE_URL}${path}`, {
    data: {
      duration: minutes,
      logged_at: new Date().toISOString().slice(0, 10),
      description: "Analytics hours logged E2E",
    },
  });
  if (!resp.ok()) {
    const body = await resp.text();
    throw new Error(`createWorklog failed with status ${resp.status()}: ${body}`);
  }
}

test.describe.serial("Analytics Hours Logged E2E", () => {
  test.beforeAll(() => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    issueId = seeded.issueId;
  });

  test.beforeEach(async ({ page }) => {
    await signInViaApi(page);
    await signInAndEnsureWorkspace(page);
    if (!analyticsSeeded) {
      // Create a couple of worklogs once so analytics & CSV have data.
      await createWorklog(page, 60);
      await createWorklog(page, 30);
      analyticsSeeded = true;
    }
  });

  test("1. Hours logged is visible in Work Items analytics and requests weekday chart", async ({ page }) => {
    const analyticsResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/workspaces/${workspaceSlug}/advance-analytics-charts/`) &&
        response.url().includes("type=custom-work-items") &&
        response.url().includes("y_axis=HOURS_LOGGED") &&
        response.url().includes("x_axis=LOGGED_DAY_OF_WEEK")
    );

    await page.goto(`${BASE_URL}/${workspaceSlug}/analytics/work-items`);
    await expect(page.getByText("Customized insights")).toBeVisible();

    // Metric selector defaults to Work item in this chart; switch to Hours logged.
    await page
      .getByRole("button", { name: /work item/i })
      .first()
      .click();
    await page.getByRole("option", { name: "Hours logged" }).click();

    const analyticsResponse = await analyticsResponsePromise;
    expect(analyticsResponse.ok()).toBeTruthy();
    await expect(page.getByRole("button", { name: "Export as CSV" })).toBeVisible();

    // Axis labels should reflect hours-logged semantics.
    await expect(page.getByText("Day of week")).toBeVisible();
    await expect(page.getByText("Hours logged")).toBeVisible();
  });

  test("2. Hours logged analytics chart API returns data", async ({ page }) => {
    const params = "?type=custom-work-items&y_axis=HOURS_LOGGED&x_axis=LOGGED_DAY_OF_WEEK&group_by=WORK_ITEMS";
    const resp = await page.request.get(
      `${API_BASE_URL}/api/workspaces/${workspaceSlug}/advance-analytics-charts/${params}`
    );
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as { data?: Array<{ name?: string; count?: number }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data ?? []).length).toBeGreaterThan(0);
  });

  test("3. Hours logged CSV export includes expected columns and non-zero hours", async ({ page }) => {
    const resp = await page.request.get(
      `${API_BASE_URL}/api/workspaces/${workspaceSlug}/analytics/time-logged-export/`
    );
    expect(resp.ok()).toBeTruthy();
    const csv = await resp.text();
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);
    const header = lines[0];
    expect(header).toContain("issue_id");
    expect(header).toContain("title");
    expect(header).toContain("hours_logged");
    expect(header).toContain("status");
    expect(header).toContain("priority");
    expect(header).toContain("assignee");

    const columns = header.split(",");
    const hoursLoggedIndex = columns.indexOf("hours_logged");
    expect(hoursLoggedIndex).toBeGreaterThan(-1);

    const hasNonZeroHours = lines.slice(1).some((line) => {
      const values = line.split(",");
      const numeric = Number.parseFloat(values[hoursLoggedIndex] || "0");
      return Number.isFinite(numeric) && numeric > 0;
    });
    expect(hasNonZeroHours).toBeTruthy();
  });
});
