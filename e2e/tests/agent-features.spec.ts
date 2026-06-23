/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * E2E Tests for Plane AI Agent — full feature coverage via chat UI and API smoke.
 *
 * Coverage matrix:
 * - Work items, cycles, modules (existing tools)
 * - States, labels, members, projects, search
 * - Wiki pages (workspace-level)
 * - Project pages (docs)
 * - Analytics, intake/inbox, relations, worklogs, views
 * - Agent shell: FAB, sessions, settings
 *
 * Prerequisites:
 * - Stack at PLAYWRIGHT_BASE_URL (default http://localhost:8081)
 * - Docker API container for seed script (ensureE2ESeedData)
 */

import { test, expect, type Page } from "@playwright/test";
import { ensureE2ESeedData, signInAndEnsureWorkspace, waitForPageLoad, BASE_URL } from "./helpers/time-tracking";
import { createWikiPageViaApi } from "./helpers/wiki";
import {
  AGENT_FAB_LABEL,
  createAgentSession,
  enableAgentViaApi,
  expectAgentEnabled,
  navigateToAgentSettings,
  openAgentChat,
  smokeListIntakeIssuesApi,
  smokeListIssueRelationsApi,
  smokeListIssueWorklogsApi,
  smokeListProjectPagesApi,
  smokeListProjectViewsApi,
  smokeListWikiPagesApi,
  smokeProjectAnalyticsApi,
  smokeWorkspaceProjectStatsApi,
} from "./helpers/agent";

let workspaceSlug: string;
let projectId: string;

test.beforeAll(() => {
  const seed = ensureE2ESeedData();
  workspaceSlug = seed.workspaceSlug;
  projectId = seed.projectId;
});

async function signInToWorkspace(page: Page) {
  const slug = await signInAndEnsureWorkspace(page);
  expect(slug.length).toBeGreaterThan(0);
  if (slug && slug !== workspaceSlug) {
    workspaceSlug = slug;
  }
  await enableAgentViaApi(page, workspaceSlug);
}

test.describe.serial("AI Agent — shell and configuration", () => {
  test.beforeEach(async ({ page }) => {
    await signInToWorkspace(page);
  });

  test("E2E-AGENT-01: FAB visible when agent enabled", async ({ page }) => {
    await page.goto(`${BASE_URL}/${workspaceSlug}/`);
    await waitForPageLoad(page);
    await expectAgentEnabled(page, workspaceSlug);
    await expect(page.getByRole("button", { name: AGENT_FAB_LABEL })).toBeVisible({ timeout: 30_000 });
  });

  test("E2E-AGENT-02: open chat panel and create session", async ({ page }) => {
    await page.goto(`${BASE_URL}/${workspaceSlug}/`);
    await waitForPageLoad(page);
    await openAgentChat(page);
    const session = await createAgentSession(page, workspaceSlug);
    expect(session.id).toBeTruthy();
  });

  test("E2E-AGENT-03: AI agent settings page loads", async ({ page }) => {
    await navigateToAgentSettings(page, workspaceSlug);
    await expect(page.getByText(/enable agent/i).first()).toBeVisible();
  });
});

test.describe.serial("AI Agent — data access smoke (API)", () => {
  test.beforeEach(async ({ page }) => {
    await signInToWorkspace(page);
  });

  test("E2E-AGENT-10: work items API reachable", async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-11: cycles API reachable", async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`
    );
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-12: modules API reachable", async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/`
    );
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-13: states API reachable", async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`
    );
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-14: labels API reachable", async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/`
    );
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-15: members API reachable", async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`
    );
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-16: search API reachable", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/search/?query=test`);
    expect(response.ok()).toBeTruthy();
  });

  test("E2E-AGENT-17: wiki pages API reachable", async ({ page }) => {
    await createWikiPageViaApi(page, workspaceSlug, { name: `Agent Wiki ${Date.now()}` });
    const pages = await smokeListWikiPagesApi(page, workspaceSlug);
    expect(Array.isArray(pages)).toBe(true);
  });

  test("E2E-AGENT-18: project pages API reachable", async ({ page }) => {
    const createResponse = await page.request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/`,
      { data: { name: `Agent Page ${Date.now()}` } }
    );
    expect(createResponse.ok()).toBeTruthy();
    const pages = await smokeListProjectPagesApi(page, workspaceSlug, projectId);
    expect(Array.isArray(pages)).toBe(true);
  });

  test("E2E-AGENT-19: intake issues API reachable", async ({ page }) => {
    const issues = await smokeListIntakeIssuesApi(page, workspaceSlug, projectId);
    expect(Array.isArray(issues)).toBe(true);
  });

  test("E2E-AGENT-20: project views API reachable", async ({ page }) => {
    const views = await smokeListProjectViewsApi(page, workspaceSlug, projectId);
    expect(Array.isArray(views)).toBe(true);
  });

  test("E2E-AGENT-21: project analytics API reachable", async ({ page }) => {
    const analytics = await smokeProjectAnalyticsApi(page, workspaceSlug, projectId);
    expect(analytics).toBeTruthy();
  });

  test("E2E-AGENT-22: workspace project stats API reachable", async ({ page }) => {
    const stats = await smokeWorkspaceProjectStatsApi(page, workspaceSlug);
    expect(Array.isArray(stats)).toBe(true);
  });

  test("E2E-AGENT-23: issue worklogs API reachable", async ({ page }) => {
    const issuesResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    expect(issuesResponse.ok()).toBeTruthy();
    const issues = (await issuesResponse.json()) as { results?: Array<{ id: string }> };
    const issueList = issues.results ?? (issues as unknown as Array<{ id: string }>);
    if (issueList.length === 0) return;
    const worklogs = await smokeListIssueWorklogsApi(page, workspaceSlug, projectId, issueList[0].id);
    expect(Array.isArray(worklogs)).toBe(true);
  });

  test("E2E-AGENT-24: issue relations API reachable", async ({ page }) => {
    const issuesResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    expect(issuesResponse.ok()).toBeTruthy();
    const issues = (await issuesResponse.json()) as { results?: Array<{ id: string }> };
    const issueList = issues.results ?? (issues as unknown as Array<{ id: string }>);
    if (issueList.length === 0) return;
    const relations = await smokeListIssueRelationsApi(page, workspaceSlug, projectId, issueList[0].id);
    expect(relations).toBeTruthy();
  });
});

test.describe.serial("AI Agent — chat UI (wiki/pages awareness)", () => {
  test.beforeEach(async ({ page }) => {
    await signInToWorkspace(page);
  });

  test("E2E-AGENT-30: agent chat opens on wiki route", async ({ page }) => {
    await page.goto(`${BASE_URL}/${workspaceSlug}/wiki`);
    await waitForPageLoad(page);
    await openAgentChat(page);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("E2E-AGENT-31: agent chat opens on project pages route", async ({ page }) => {
    await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/pages`);
    await waitForPageLoad(page);
    await openAgentChat(page);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  /**
   * Full LLM tool-call verification requires a configured API key.
   * When E2E_AGENT_API_KEY is set, send a prompt that should invoke list_wiki_pages.
   */
  test("E2E-AGENT-32: wiki tool invocation (requires API key)", async ({ page }) => {
    test.skip(!process.env.E2E_AGENT_API_KEY, "Set E2E_AGENT_API_KEY to run LLM tool-call tests");

    await createWikiPageViaApi(page, workspaceSlug, { name: "Agent Tool Test Wiki" });
    await page.goto(`${BASE_URL}/${workspaceSlug}/wiki`);
    await waitForPageLoad(page);
    await openAgentChat(page);

    const input = page.getByRole("textbox").first();
    await input.fill("List all wiki pages in this workspace using your tools.");
    const sendButton = page.getByRole("button", { name: /send/i });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect(page.getByText("list_wiki_pages", { exact: false }).first()).toBeVisible({
      timeout: 90_000,
    });
  });
});
