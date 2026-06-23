/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Helpers for AI Agent chat E2E tests.
 */

import { expect, type Page } from "@playwright/test";
import { BASE_URL, waitForPageLoad } from "./time-tracking";

export const AGENT_FAB_LABEL = "Open AI Agent";

export async function enableAgentViaApi(page: Page, workspaceSlug: string) {
  const configResponse = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/agent/config/`);
  if (configResponse.ok()) {
    const patch = await page.request.patch(`${BASE_URL}/api/workspaces/${workspaceSlug}/agent/config/`, {
      data: { is_enabled: true, provider: "openai", model: "gpt-5.5" },
    });
    if (patch.ok()) return;
  }

  const post = await page.request.post(`${BASE_URL}/api/workspaces/${workspaceSlug}/agent/config/`, {
    data: { is_enabled: true, provider: "openai", model: "gpt-5.5" },
  });
  expect(post.ok()).toBeTruthy();
}

export async function openAgentChat(page: Page) {
  const fab = page.getByRole("button", { name: AGENT_FAB_LABEL });
  await expect(fab).toBeVisible({ timeout: 30_000 });
  await fab.click();
  await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 15_000 });
}

export async function sendAgentMessage(page: Page, message: string) {
  const input = page.getByRole("textbox").first();
  await input.fill(message);
  const sendButton = page.getByRole("button", { name: /send/i });
  if (await sendButton.isEnabled()) {
    await sendButton.click();
    return true;
  }
  return false;
}

export async function waitForToolCall(page: Page, toolName: string, timeoutMs = 60_000) {
  const toolLocator = page.getByText(toolName, { exact: false });
  await expect(toolLocator.first()).toBeVisible({ timeout: timeoutMs });
}

export async function navigateToAgentSettings(page: Page, workspaceSlug: string) {
  await page.goto(`${BASE_URL}/${workspaceSlug}/settings/ai-agent/`);
  await waitForPageLoad(page);
  await expect(page.getByRole("heading", { name: /AI Agent/i })).toBeVisible({ timeout: 30_000 });
}

/** Smoke-check agent config API exposes enabled state. */
export async function expectAgentEnabled(page: Page, workspaceSlug: string) {
  const response = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/agent/config/`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { is_enabled?: boolean };
  expect(body.is_enabled).toBe(true);
}

/** Invoke a tool directly via the agent tool executor path (API-level smoke). */
export async function smokeListWikiPagesApi(page: Page, workspaceSlug: string) {
  const response = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/wiki-pages/`);
  expect(response.ok()).toBeTruthy();
  const pages = (await response.json()) as unknown[];
  return pages;
}

export async function smokeListProjectPagesApi(page: Page, workspaceSlug: string, projectId: string) {
  const response = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/`);
  expect(response.ok()).toBeTruthy();
  const pages = (await response.json()) as unknown[];
  return pages;
}

export async function smokeListIntakeIssuesApi(page: Page, workspaceSlug: string, projectId: string) {
  let response = await page.request.get(
    `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-issues/`
  );
  if (response.status() === 404) {
    const createIntake = await page.request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/intakes/`,
      { data: { name: "Intake" } }
    );
    expect(createIntake.ok()).toBeTruthy();
    response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-issues/`
    );
  }
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { results?: unknown[] };
  return body.results ?? body;
}

export async function smokeListProjectViewsApi(page: Page, workspaceSlug: string, projectId: string) {
  const response = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/views/`);
  expect(response.ok()).toBeTruthy();
  const views = (await response.json()) as unknown[];
  return views;
}

export async function smokeProjectAnalyticsApi(page: Page, workspaceSlug: string, projectId: string) {
  const response = await page.request.get(
    `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/advance-analytics/`
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Record<string, unknown>;
}

export async function smokeWorkspaceProjectStatsApi(page: Page, workspaceSlug: string) {
  const response = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/project-stats/`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as unknown[];
}

export async function smokeListIssueWorklogsApi(page: Page, workspaceSlug: string, projectId: string, issueId: string) {
  const response = await page.request.get(
    `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as unknown[];
}

export async function smokeListIssueRelationsApi(
  page: Page,
  workspaceSlug: string,
  projectId: string,
  issueId: string
) {
  const response = await page.request.get(
    `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-relation/`
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Record<string, unknown>;
}

export async function createAgentSession(page: Page, workspaceSlug: string) {
  const response = await page.request.post(`${BASE_URL}/api/workspaces/${workspaceSlug}/agent/sessions/`, {
    data: {},
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
}
