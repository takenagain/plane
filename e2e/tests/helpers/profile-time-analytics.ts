/* oxlint-disable no-await-in-loop */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  API_BASE_URL,
  BASE_URL,
  signInAndEnsureWorkspace,
  signInViaApi,
  tryEnsureE2ESeedData,
  waitForPageLoad,
} from "./time-tracking";

export type ProfileTimeE2EContext = {
  workspaceSlug: string;
  userId: string;
  projectId: string;
  issueId: string;
};

function extractList(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  if ("results" in payload && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: unknown[] }).results;
  }
  return Array.isArray(payload) ? payload : [];
}

async function fetchCurrentUserId(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const meResponse = await page.request.get(`${API_BASE_URL}/api/users/me/`);
    if (meResponse.ok()) {
      const me = (await meResponse.json()) as { id: string };
      return me.id;
    }
    await signInViaApi(page);
  }
  throw new Error("Unable to load /api/users/me/ after sign-in attempts");
}

export async function resolveProfileTimeE2EContext(page: Page): Promise<ProfileTimeE2EContext> {
  const seeded = tryEnsureE2ESeedData();
  if (seeded) {
    const userId = await fetchCurrentUserId(page);
    return {
      workspaceSlug: seeded.workspaceSlug,
      userId,
      projectId: seeded.projectId,
      issueId: seeded.issueId,
    };
  }

  const userId = await fetchCurrentUserId(page);

  let workspacesResponse = await page.request.get(`${API_BASE_URL}/api/users/me/workspaces/`);
  if (!workspacesResponse.ok()) {
    workspacesResponse = await page.request.get(`${API_BASE_URL}/api/workspaces/`);
  }
  expect(workspacesResponse.ok()).toBeTruthy();
  const workspaces = extractList(await workspacesResponse.json());
  expect(workspaces.length).toBeGreaterThan(0);

  const workspace = workspaces[0] as { slug?: string };
  const workspaceSlug = workspace.slug ?? "";
  expect(workspaceSlug).not.toBe("");

  const projectsResponse = await page.request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/`);
  expect(projectsResponse.ok()).toBeTruthy();
  const projects = extractList(await projectsResponse.json());
  expect(projects.length).toBeGreaterThan(0);

  const project = projects[0] as { id?: string };
  const projectId = project.id ?? "";
  expect(projectId).not.toBe("");

  const issuesResponse = await page.request.get(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
  );
  expect(issuesResponse.ok()).toBeTruthy();
  const issues = extractList(await issuesResponse.json());
  expect(issues.length).toBeGreaterThan(0);

  const issue = issues[0] as { id?: string };
  const issueId = issue.id ?? "";
  expect(issueId).not.toBe("");

  return { workspaceSlug, userId, projectId, issueId };
}

export async function createProfileWorklog(page: Page, ctx: ProfileTimeE2EContext, minutes: number) {
  const path = `/api/workspaces/${ctx.workspaceSlug}/projects/${ctx.projectId}/issues/${ctx.issueId}/worklogs/`;
  const resp = await page.request.post(`${API_BASE_URL}${path}`, {
    data: {
      duration: minutes,
      logged_at: new Date().toISOString().slice(0, 10),
      description: "Profile time analytics E2E",
    },
  });
  if (!resp.ok()) {
    const body = await resp.text();
    throw new Error(`createProfileWorklog failed with status ${resp.status()}: ${body}`);
  }
}

export function profileTimeAnalyticsUrl(ctx: ProfileTimeE2EContext) {
  return `${BASE_URL}/${ctx.workspaceSlug}/profile/${ctx.userId}/time`;
}

export function profileYourWorkUrl(ctx: ProfileTimeE2EContext) {
  return `${BASE_URL}/${ctx.workspaceSlug}/profile/${ctx.userId}`;
}

/** Returns false when the target instance has not deployed profile time analytics yet. */
export async function isProfileTimeAnalyticsAvailable(page: Page, ctx: ProfileTimeE2EContext): Promise<boolean> {
  const response = await page.request.get(
    `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}/summary/?date_filter=last_7_days`
  );
  return response.ok();
}

export async function navigateToHoursLoggedViaYourWork(page: Page, ctx: ProfileTimeE2EContext) {
  await page.goto(profileYourWorkUrl(ctx));
  await waitForPageLoad(page);

  const hoursTab = page
    .getByRole("link", { name: /hours logged/i })
    .or(page.locator(`a[href*="/profile/${ctx.userId}/time"]`))
    .or(page.getByRole("link", { name: /profile\.tabs\.time/i }));

  if (
    await hoursTab
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
  ) {
    await hoursTab.first().click();
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp(`/profile/${ctx.userId}/time`));
    return;
  }

  await page.goto(profileTimeAnalyticsUrl(ctx));
  await waitForPageLoad(page);
  await expect(page).toHaveURL(new RegExp(`/profile/${ctx.userId}/time`));
}

export async function waitForProfileTimeSummary(page: Page, ctx: ProfileTimeE2EContext) {
  const response = await page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}`) &&
      resp.url().includes("/summary/") &&
      resp.status() === 200,
    { timeout: 30_000 }
  );
  return response;
}

export async function waitForProfileTimeCharts(page: Page, ctx: ProfileTimeE2EContext) {
  const response = await page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/workspaces/${ctx.workspaceSlug}/user-time-analytics/${ctx.userId}`) &&
      resp.url().includes("/charts/") &&
      resp.status() === 200,
    { timeout: 30_000 }
  );
  return response;
}

export async function ensureUiSignedIn(page: Page) {
  await signInViaApi(page);
  const emailInput = page
    .getByPlaceholder("name@company.com")
    .or(page.locator("input[type='email'], input[name='email']"))
    .first();
  if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await signInAndEnsureWorkspace(page);
  }
}

export async function gotoHoursLoggedDirect(page: Page, ctx: ProfileTimeE2EContext) {
  await ensureUiSignedIn(page);
  const summaryPromise = waitForProfileTimeSummary(page, ctx).catch(() => null);
  const chartsPromise = waitForProfileTimeCharts(page, ctx).catch(() => null);
  await page.goto(profileTimeAnalyticsUrl(ctx));
  await waitForPageLoad(page);
  await ensureUiSignedIn(page);
  if (page.url().includes("/sign-in")) {
    await signInAndEnsureWorkspace(page);
    await page.goto(profileTimeAnalyticsUrl(ctx));
    await waitForPageLoad(page);
  }
  await Promise.all([summaryPromise, chartsPromise]);
  await expect(page.getByTestId("profile-time-analytics-dashboard")).toBeVisible({ timeout: 30_000 });
}
