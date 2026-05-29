/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Workspace Settings → Exports E2E (Goal 5: Workspace export).
 *
 * Run against local docker-compose (default http://localhost:8081):
 *   cd e2e && pnpm exec playwright test tests/workspace-export.spec.ts
 *
 * Run against a remote instance:
 *   PLAYWRIGHT_BASE_URL=http://host:8081 E2E_SKIP_SEED=1 \
 *   pnpm exec playwright test tests/workspace-export.spec.ts
 */

import { test, expect } from "@playwright/test";
import { tryEnsureE2ESeedData, WORKSPACE_NAME } from "./helpers/time-tracking";
import {
  assertExportFormVisible,
  assertExportHistorySection,
  assertExportHistoryHasEntries,
  assertExportQueuedViaApi,
  clickExportAllProjects,
  ensureSignedIn,
  EXPORT_SUCCESS_TITLE,
  navigateToWorkspaceExports,
  selectExportFormat,
  waitForExportIssuesList,
  waitForExportIssuesPost,
} from "./helpers/workspace-export";

let workspaceSlug: string;

test.beforeAll(() => {
  const seed = tryEnsureE2ESeedData();
  workspaceSlug = seed?.workspaceSlug ?? WORKSPACE_NAME;
});

test.describe.serial("Workspace export settings", () => {
  test.beforeEach(async ({ page }) => {
    await ensureSignedIn(page);
    expect(workspaceSlug).toBeTruthy();
  });

  test("navigates to exports settings and shows export form", async ({ page }) => {
    const listPromise = waitForExportIssuesList(page, workspaceSlug);
    await navigateToWorkspaceExports(page, workspaceSlug);
    await listPromise;

    await assertExportFormVisible(page);
    await assertExportHistorySection(page);
  });

  test("export all projects queues job (POST 200 + success toast)", async ({ page }) => {
    await navigateToWorkspaceExports(page, workspaceSlug);
    await assertExportFormVisible(page);

    const postPromise = waitForExportIssuesPost(page, workspaceSlug);
    await clickExportAllProjects(page);
    const postResponse = await postPromise;

    expect(postResponse.status()).toBe(200);
    const postBody = (await postResponse.json()) as { message?: string };
    expect(postBody.message).toMatch(/download/i);

    await expect(page.getByText(EXPORT_SUCCESS_TITLE)).toBeVisible({ timeout: 15_000 });
  });

  test("previous exports list loads after export (GET export-issues)", async ({ page }) => {
    const listPromise = waitForExportIssuesList(page, workspaceSlug);
    await navigateToWorkspaceExports(page, workspaceSlug);
    const listResponse = await listPromise;
    expect(listResponse.ok()).toBeTruthy();

    await assertExportHistoryHasEntries(page);
    await assertExportQueuedViaApi(page, workspaceSlug);
  });

  test("can select JSON format before export all projects", async ({ page }) => {
    await navigateToWorkspaceExports(page, workspaceSlug);
    await selectExportFormat(page, "JSON");

    const postPromise = waitForExportIssuesPost(page, workspaceSlug);
    await clickExportAllProjects(page);
    const postResponse = await postPromise;

    expect(postResponse.status()).toBe(200);
    const requestBody = postResponse.request().postDataJSON() as { provider?: string; multiple?: boolean };
    expect(requestBody.provider).toBe("json");
    expect(requestBody.multiple).toBe(true);
    expect(requestBody.project).toEqual([]);
  });
});
