/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { API_BASE_URL, BASE_URL, signInAndEnsureWorkspace, signInViaApi, waitForPageLoad } from "./time-tracking";

export const EXPORTS_HEADING = "Exports";
export const EXPORT_ALL_PROJECTS_LABEL = "Export all projects";
export const PREVIOUS_EXPORTS_HEADING = "Previous exports";
export const EXPORT_SUCCESS_TITLE = "Export successful";

export function workspaceExportsUrl(workspaceSlug: string): string {
  return `${BASE_URL}/${workspaceSlug}/settings/exports`;
}

export async function navigateToWorkspaceExports(page: Page, workspaceSlug: string): Promise<void> {
  if (page.url().includes("/sign-in")) {
    await ensureSignedIn(page);
  }
  await page.goto(workspaceExportsUrl(workspaceSlug));
  await waitForPageLoad(page);
  if (page.url().includes("/sign-in")) {
    await ensureSignedIn(page);
    await page.goto(workspaceExportsUrl(workspaceSlug));
    await waitForPageLoad(page);
  }
  await expect(page.getByRole("heading", { name: EXPORTS_HEADING, exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

export async function waitForExportIssuesList(page: Page, workspaceSlug: string) {
  return page.waitForResponse(
    (resp) =>
      resp.request().method() === "GET" &&
      resp.url().includes(`/api/workspaces/${workspaceSlug}/export-issues`) &&
      resp.ok(),
    { timeout: 30_000 }
  );
}

export async function waitForExportIssuesPost(page: Page, workspaceSlug: string) {
  return page.waitForResponse(
    (resp) =>
      resp.request().method() === "POST" &&
      resp.url().includes(`/api/workspaces/${workspaceSlug}/export-issues`) &&
      resp.status() === 200,
    { timeout: 60_000 }
  );
}

export async function clickExportAllProjects(page: Page): Promise<void> {
  const exportAllButton = page.getByRole("button", { name: EXPORT_ALL_PROJECTS_LABEL });
  await expect(exportAllButton).toBeVisible({ timeout: 15_000 });
  await expect(exportAllButton).toBeEnabled();
  await exportAllButton.click();
}

export async function ensureSignedIn(page: Page): Promise<void> {
  await signInViaApi(page);
  const emailInput = page
    .getByPlaceholder("name@company.com")
    .or(page.locator("input[type='email'], input[name='email']"))
    .first();
  if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await signInAndEnsureWorkspace(page);
  }
}

function exportFormLocator(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: EXPORT_ALL_PROJECTS_LABEL }),
  });
}

export async function selectExportFormat(page: Page, formatLabel: string): Promise<void> {
  const form = exportFormLocator(page);
  const formatButton = form.getByRole("button", { name: /^(CSV|JSON|Excel)$/ }).first();
  await expect(formatButton).toBeVisible({ timeout: 15_000 });
  await formatButton.click();
  await page.getByRole("option", { name: formatLabel, exact: true }).click();
  await expect(formatButton).toHaveText(formatLabel, { timeout: 10_000 });
}

export async function assertExportFormVisible(page: Page): Promise<void> {
  await expect(page.getByText("Exporting project", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Format", level: 4 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: EXPORT_ALL_PROJECTS_LABEL })).toBeVisible();
}

export async function assertExportHistorySection(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: PREVIOUS_EXPORTS_HEADING, exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

export async function assertExportHistoryHasEntries(page: Page): Promise<void> {
  await assertExportHistorySection(page);
  await expect(page.getByRole("heading", { name: "No exports yet", exact: true })).not.toBeVisible();
  await expect(page.getByRole("table")).toContainText(/queued|processing|completed/i, { timeout: 15_000 });
}

export async function assertExportQueuedViaApi(page: Page, workspaceSlug: string): Promise<void> {
  await signInViaApi(page);
  const listResponse = await page.request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/export-issues/`, {
    params: { per_page: "10", cursor: "10:0:0" },
  });
  expect(listResponse.ok()).toBeTruthy();
  const body = (await listResponse.json()) as { results?: { status?: string }[] };
  const results = body.results ?? [];
  expect(results.length).toBeGreaterThan(0);
  const latest = results[0];
  expect(latest?.status).toMatch(/queued|processing|completed/);
}
