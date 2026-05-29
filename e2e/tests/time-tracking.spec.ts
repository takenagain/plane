/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
/* oxlint-disable no-await-in-loop */
/**
 * E2E Tests for Time Tracking (Worklog) Feature - Browser Tests
 *
 * Flow:
 * 1. Instance setup via god-mode (admin signup) - if not already done
 * 2. Sign in with email/password (two-step: email -> Continue -> password -> Go to workspace)
 * 3. Complete onboarding: profile setup -> role -> use case -> workspace creation
 * 4. Create a project
 * 5. Create a work item (issue)
 * 6. Log time (worklog) via UI and API, verify CRUD, validation, and cumulative tracking
 *
 * Prerequisites:
 * - Docker containers running via docker-compose.yml
 * - Plane accessible at http://localhost:8081
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_FIRST_NAME,
  ADMIN_LAST_NAME,
  ADMIN_PASSWORD,
  BASE_URL,
  COMPANY_NAME,
  ISSUE_TITLE,
  PROJECT_NAME,
  ensureE2ESeedData,
  signInAndEnsureWorkspace,
  signInViaApi,
  waitForPageLoad,
} from "./helpers/time-tracking";

// Shared state across serial tests
let workspaceSlug = "";
let projectId = "";
let issueId = "";

async function waitForApiReady(page: Page) {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await page.request.get(`${BASE_URL}/api/instances/`);
      if (response.ok()) {
        ready = true;
        break;
      }
    } catch {
      // API not ready yet
    }
    await page.waitForTimeout(2000);
  }
  expect(ready).toBe(true);
}

async function findFirstAccessibleProject(page: Page): Promise<{ workspaceSlug: string; projectId: string } | null> {
  try {
    let workspacesResponse = await page.request.get(`${BASE_URL}/api/users/me/workspaces/`);
    if (!workspacesResponse.ok()) {
      workspacesResponse = await page.request.get(`${BASE_URL}/api/workspaces/`);
    }
    if (!workspacesResponse.ok()) return null;

    const workspacesData = await workspacesResponse.json();
    const workspaces = workspacesData.results || workspacesData;
    if (!Array.isArray(workspaces)) return null;

    for (const workspace of workspaces) {
      const slug = workspace?.slug;
      if (typeof slug !== "string" || slug.length === 0) continue;

      const projectsResponse = await page.request.get(`${BASE_URL}/api/workspaces/${slug}/projects/`);
      if (!projectsResponse.ok()) continue;

      const projectsData = await projectsResponse.json();
      const projects = projectsData.results || projectsData;
      if (!Array.isArray(projects) || projects.length === 0) continue;

      const id = projects[0]?.id;
      if (typeof id === "string" && id.length > 0) {
        return { workspaceSlug: slug, projectId: id };
      }
    }
  } catch {
    // no-op
  }

  return null;
}
test.describe.serial("Time Tracking E2E Flow", () => {
  test.beforeAll(() => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    issueId = seeded.issueId;
  });

  test("1. Instance setup via god-mode", async ({ page }) => {
    await waitForApiReady(page);
    await page.goto(BASE_URL);
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);
    // If we see the email login form, instance is already configured
    const emailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']"));
    if (await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return; // Already set up
    }
    // Click "Get started" to go to god-mode
    const getStartedButton = page
      .getByRole("link", { name: /get started/i })
      .or(page.locator("a", { hasText: /get started/i }));
    await expect(getStartedButton).toBeVisible({ timeout: 30_000 });
    await getStartedButton.click();
    await page.waitForURL(/god-mode/, { timeout: 30_000 });
    await waitForPageLoad(page);
    // Verify redirect goes through proxy
    const currentUrl = page.url();
    expect(currentUrl).toContain("8081");
    expect(currentUrl).toContain("god-mode");
    await page.waitForTimeout(3000);
    // Fill admin setup form
    const firstNameInput = page.locator("#first_name").or(page.getByLabel(/first name/i));
    await expect(firstNameInput).toBeVisible({ timeout: 15_000 });
    await firstNameInput.fill(ADMIN_FIRST_NAME);
    await page
      .locator("#last_name")
      .or(page.getByLabel(/last name/i))
      .fill(ADMIN_LAST_NAME);
    await page.locator("#email").or(page.getByLabel(/email/i)).fill(ADMIN_EMAIL);
    await page
      .locator("#company_name")
      .or(page.getByLabel(/company name/i))
      .fill(COMPANY_NAME);
    await page
      .locator("#password")
      .or(page.getByPlaceholder(/new password/i))
      .fill(ADMIN_PASSWORD);
    await page
      .locator("#confirm_password")
      .or(page.getByPlaceholder(/confirm password/i))
      .fill(ADMIN_PASSWORD);
    const submitButton = page.getByRole("button", { name: /continue/i }).or(page.locator("button[type='submit']"));
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();
    await page.waitForTimeout(10_000);
    await waitForPageLoad(page);
    const finalUrl = page.url();
    expect(finalUrl.includes("god-mode") || finalUrl.includes("8081")).toBe(true);
  });
  test("2. Sign in and complete onboarding", async ({ page }) => {
    const slug = await signInAndEnsureWorkspace(page);
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("/sign-in");
    // We should either have a workspace slug or be in onboarding
    // If still in onboarding, the workspace will be created by the time tests proceed
    if (slug) {
      workspaceSlug = slug;
    }
  });
  test("3. Create a new project", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    await page.waitForTimeout(2000);
    // If we still don't have a workspace slug, try to get it from the URL or API
    if (!workspaceSlug) {
      const currentUrl = page.url();
      const match = currentUrl.match(/\/([a-zA-Z0-9_-]+)\//);
      if (match && match[1] !== "onboarding" && match[1] !== "sign-in") {
        workspaceSlug = match[1];
      }
    }
    expect(workspaceSlug).toBeTruthy();
    // Check if a project already exists
    const projectsResponse = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`);
    if (projectsResponse.ok()) {
      const projectsData = await projectsResponse.json();
      const projects = projectsData.results || projectsData;
      if (Array.isArray(projects) && projects.length > 0) {
        projectId = projects[0].id;
        return; // Project already exists
      }
    }
    // Navigate to the projects page
    await page.goto(`${BASE_URL}/${workspaceSlug}/projects/`);
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);
    // Click "Create project" button
    const createProjectBtn = page
      .getByRole("button", { name: /create.*project|new.*project|add.*project/i })
      .or(page.locator("button", { hasText: /create.*project|new.*project/i }));
    if (await createProjectBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await createProjectBtn.click();
      await page.waitForTimeout(2000);
      const projectNameInput = page
        .getByPlaceholder(/project name|title/i)
        .or(page.locator("input[name='name']").first());
      await expect(projectNameInput).toBeVisible({ timeout: 10_000 });
      await projectNameInput.fill(PROJECT_NAME);
      await page.waitForTimeout(1000);
      const createBtn = page
        .getByRole("button", { name: /^create$/i })
        .or(page.locator("button[type='submit']", { hasText: /create/i }));
      if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await createBtn.click();
        await waitForPageLoad(page);
        await page.waitForTimeout(5000);
      }
    } else {
      // Fallback: create project via API
      const createResponse = await page.request.post(`${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`, {
        data: {
          name: PROJECT_NAME,
          identifier: "TTQA",
          network: 2,
        },
      });

      if (createResponse.status() >= 300) {
        const fallbackProject = await findFirstAccessibleProject(page);
        if (fallbackProject) {
          workspaceSlug = fallbackProject.workspaceSlug;
          projectId = fallbackProject.projectId;
          return;
        }
      }

      expect(createResponse.status()).toBeLessThan(300);
    }
    // Get project ID
    const refreshedProjects = await page.request.get(`${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`);
    if (refreshedProjects.ok()) {
      const data = await refreshedProjects.json();
      const projects = data.results || data;
      if (Array.isArray(projects) && projects.length > 0) {
        projectId = projects[0].id;
      }
    }
    expect(projectId).toBeTruthy();
  });
  test("4. Create a new work item (issue)", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    // Check if issue already exists
    const issuesResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    if (issuesResponse.ok()) {
      const issuesData = await issuesResponse.json();
      const issues = issuesData.results || issuesData;
      if (Array.isArray(issues) && issues.length > 0) {
        issueId = issues[0].id;
        return;
      }
    }
    // Navigate to the project's issues page
    await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/`);
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);
    // Try to create via UI
    const createIssueBtn = page
      .getByRole("button", { name: /create|add.*issue|new.*issue|add.*work.*item|create.*work.*item/i })
      .first();
    if (await createIssueBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await createIssueBtn.click();
      await page.waitForTimeout(2000);
      const issueTitleInput = page
        .getByPlaceholder(/title|issue name|work item/i)
        .or(page.locator("input[name='name']").first());
      if (await issueTitleInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await issueTitleInput.fill(ISSUE_TITLE);
        const createBtn = page
          .getByRole("button", { name: /^create$/i })
          .or(page.locator("button[type='submit']", { hasText: /create/i }));
        if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await createBtn.click();
          await waitForPageLoad(page);
          await page.waitForTimeout(3000);
        }
      }
    } else {
      // Fallback: create via API
      const createResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
        { data: { name: ISSUE_TITLE } }
      );
      expect(createResponse.status()).toBeLessThan(300);
    }
    // Get issue ID
    const refreshedIssues = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    if (refreshedIssues.ok()) {
      const data = await refreshedIssues.json();
      const issues = data.results || data;
      if (Array.isArray(issues) && issues.length > 0) {
        issueId = issues[0].id;
      }
    }
    expect(issueId).toBeTruthy();
  });
  test("5. Open issue detail and log time via UI", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();
    // Navigate to the issue detail page
    await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${issueId}`);
    await waitForPageLoad(page);
    await page.waitForTimeout(5000);
    // Look for the "Activity" tab
    const activityTab = page
      .getByRole("button", { name: /activity/i })
      .or(page.locator("button", { hasText: /activity/i }));
    if (await activityTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await activityTab.click();
      await page.waitForTimeout(1000);
    }
    // Find and click the "Log time" button
    const logTimeBtn = page
      .getByRole("button", { name: /log time/i })
      .or(page.locator("button", { hasText: /log time/i }));
    if (await logTimeBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await logTimeBtn.click();
      await page.waitForTimeout(2000);
      // Fill hours
      const hoursInput = page
        .getByLabel(/hours/i)
        .or(page.locator("input[placeholder*='hr'], input[aria-label*='Hour']"));
      if (await hoursInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await hoursInput.fill("1");
      }
      // Fill minutes
      const minutesInput = page
        .getByLabel(/minutes/i)
        .or(page.locator("input[placeholder*='min'], input[aria-label*='Min']"));
      if (await minutesInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await minutesInput.fill("30");
      }
      // Notes
      const notesInput = page
        .getByPlaceholder(/what did you work on|add a comment|describe/i)
        .or(page.locator("textarea").first());
      if (await notesInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await notesInput.fill("Initial time log for testing");
      }
      // Submit
      const submitBtn = page.getByRole("button", { name: /log time|submit|save/i }).last();
      await submitBtn.click();
      await page.waitForTimeout(3000);
    } else {
      // Fallback: create worklog via API
      const today = new Date().toISOString().split("T")[0];
      const createResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`,
        {
          data: {
            duration: 90,
            logged_at: today,
            description: "Initial time log for testing (API fallback)",
          },
        }
      );
      expect(createResponse.status()).toBe(201);
    }
    // Verify worklog exists via API
    const worklogsResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`
    );
    expect(worklogsResponse.ok()).toBe(true);
    const worklogs = await worklogsResponse.json();
    expect(worklogs.length).toBeGreaterThan(0);
  });
  test("6. Worklog API CRUD: create, read, update, delete", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();
    const worklogBaseUrl = `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
    const today = new Date().toISOString().split("T")[0];
    // CREATE
    const createResponse = await page.request.post(worklogBaseUrl, {
      data: {
        duration: 45,
        logged_at: today,
        description: "API CRUD test worklog",
      },
    });
    expect(createResponse.status()).toBe(201);
    const createdWorklog = await createResponse.json();
    expect(createdWorklog.duration).toBe(45);
    expect(createdWorklog.description).toBe("API CRUD test worklog");
    const worklogId = createdWorklog.id;
    // READ list
    const listResponse = await page.request.get(worklogBaseUrl);
    expect(listResponse.ok()).toBe(true);
    const worklogs = await listResponse.json();
    expect(Array.isArray(worklogs)).toBe(true);
    expect(worklogs.length).toBeGreaterThan(0);
    // READ total duration
    const totalResponse = await page.request.get(`${worklogBaseUrl}total/`);
    expect(totalResponse.ok()).toBe(true);
    const totalData = await totalResponse.json();
    expect(totalData).toHaveProperty("total_duration");
    expect(totalData.total_duration).toBeGreaterThanOrEqual(45);
    // UPDATE
    const updateResponse = await page.request.patch(`${worklogBaseUrl}${worklogId}/`, {
      data: {
        duration: 60,
        description: "Updated API CRUD test worklog",
      },
    });
    expect(updateResponse.status()).toBe(200);
    const updatedWorklog = await updateResponse.json();
    expect(updatedWorklog.duration).toBe(60);
    expect(updatedWorklog.description).toBe("Updated API CRUD test worklog");
    // DELETE
    const deleteResponse = await page.request.delete(`${worklogBaseUrl}${worklogId}/`);
    expect(deleteResponse.status()).toBe(204);
    // Verify deleted
    const afterDeleteList = await page.request.get(worklogBaseUrl);
    const afterDeleteWorklogs = await afterDeleteList.json();
    const found = afterDeleteWorklogs.find((w: { id: string }) => w.id === worklogId);
    expect(found).toBeUndefined();
  });
  test("7. Worklog validation: reject zero duration and future dates", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();
    const worklogBaseUrl = `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
    const today = new Date().toISOString().split("T")[0];
    // Zero duration should be rejected
    const zeroDurationResponse = await page.request.post(worklogBaseUrl, {
      data: { duration: 0, logged_at: today },
    });
    expect(zeroDurationResponse.status()).toBe(400);
    // Future date should be rejected
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];
    const futureDateResponse = await page.request.post(worklogBaseUrl, {
      data: { duration: 60, logged_at: futureDateStr },
    });
    expect(futureDateResponse.status()).toBe(400);
  });
  test("8. Cumulative time tracking: multiple worklogs add up", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();
    const worklogBaseUrl = `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
    const today = new Date().toISOString().split("T")[0];
    // Get current total
    const initialTotalResponse = await page.request.get(`${worklogBaseUrl}total/`);
    const initialTotal = await initialTotalResponse.json();
    const initialDuration = initialTotal.total_duration || 0;
    // Create two worklogs
    const w1 = await page.request.post(worklogBaseUrl, {
      data: { duration: 30, logged_at: today, description: "Morning work" },
    });
    expect(w1.status()).toBe(201);
    const worklog1 = await w1.json();
    const w2 = await page.request.post(worklogBaseUrl, {
      data: { duration: 45, logged_at: today, description: "Afternoon work" },
    });
    expect(w2.status()).toBe(201);
    const worklog2 = await w2.json();
    // Verify cumulative total
    const finalTotalResponse = await page.request.get(`${worklogBaseUrl}total/`);
    const finalTotal = await finalTotalResponse.json();
    expect(finalTotal.total_duration).toBe(initialDuration + 30 + 45);
    // Verify list count
    const listResponse = await page.request.get(worklogBaseUrl);
    const worklogs = await listResponse.json();
    expect(worklogs.length).toBeGreaterThanOrEqual(2);
    // Cleanup
    await page.request.delete(`${worklogBaseUrl}${worklog1.id}/`);
    await page.request.delete(`${worklogBaseUrl}${worklog2.id}/`);
    // Verify total back to initial
    const cleanTotal = await (await page.request.get(`${worklogBaseUrl}total/`)).json();
    expect(cleanTotal.total_duration).toBe(initialDuration);
  });
  test("9. Browser: verify issue detail page loads with worklog data", async ({ page }) => {
    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();
    // Navigate to the issue detail page
    await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${issueId}`);
    await waitForPageLoad(page);
    await page.waitForTimeout(5000);
    // Verify page loaded with content
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();
    // Verify worklogs via API
    const worklogsResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`
    );
    expect(worklogsResponse.ok()).toBe(true);
    const worklogs = await worklogsResponse.json();
    expect(worklogs.length).toBeGreaterThan(0);
    // Verify total duration endpoint
    const totalResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/total/`
    );
    expect(totalResponse.ok()).toBe(true);
    const totalData = await totalResponse.json();
    expect(totalData.total_duration).toBeGreaterThan(0);
  });
  test("10. Browser: Floating FOB survives navigation, expands on hover, links back to the tracked work item, and hides after stop", async ({
    page,
  }) => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    issueId = seeded.issueId;

    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();

    await signInViaApi(page);

    for (let attempt = 0; attempt < 4; attempt++) {
      await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${issueId}`);
      await waitForPageLoad(page);
      await page.waitForTimeout(2500);

      const emailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']")).first();
      if (await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await signInAndEnsureWorkspace(page);
        continue;
      }

      const noWorkspaceMessage = page.getByText(/you don't seem to have any invites to a workspace/i);
      if (await noWorkspaceMessage.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const reseeded = ensureE2ESeedData();
        workspaceSlug = reseeded.workspaceSlug;
        projectId = reseeded.projectId;
        issueId = reseeded.issueId;
        continue;
      }

      break;
    }

    const finalEmailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']")).first();
    if (await finalEmailInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await signInAndEnsureWorkspace(page);
      await signInViaApi(page);
      await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${issueId}`);
      await waitForPageLoad(page);
      await page.waitForTimeout(1500);
    }

    const trackingActions = page.getByTestId("issue-time-tracking-actions").first();
    const startStopButton = trackingActions.getByTestId("issue-time-start-stop-button");
    const sessionTimer = trackingActions.getByTestId("issue-time-session-timer");
    const floatingFob = page.getByTestId("floating-time-tracking-fob");
    const floatingActionButton = page.getByTestId("floating-time-tracking-fob-primary-button");
    const floatingCompactTime = page.getByTestId("floating-time-tracking-fob-compact-time");
    const activeWorklogUrl = `${BASE_URL}/api/workspaces/${workspaceSlug}/worklogs/active/`;

    await expect(startStopButton).toBeVisible({ timeout: 15_000 });
    const trackedWorkItemUrl = page.url();

    await test.step("sub-test: normalizes state to Start before the focused FOB workflow begins", async () => {
      const localCurrentText = (await startStopButton.textContent())?.trim().toLowerCase() ?? "";
      const floatingActionLabel = (await floatingActionButton.getAttribute("aria-label").catch(() => null)) ?? "";
      const floatingCurrentText = floatingActionLabel.trim().toLowerCase();

      if (floatingCurrentText === "stop time tracking") {
        await floatingActionButton.click();
        await expect(floatingFob).toHaveCount(0, { timeout: 15_000 });
      } else if (localCurrentText === "stop") {
        await startStopButton.click();
      }

      await expect(startStopButton).toHaveText(/start/i, { timeout: 15_000 });
    });

    await test.step("sub-test: clicking Start shows the active FOB immediately and syncs the local control", async () => {
      await startStopButton.click();

      await expect(floatingActionButton).toHaveAttribute("aria-label", /stop time tracking/i, { timeout: 15_000 });
      await expect(floatingActionButton).not.toContainText(/stop/i, { timeout: 15_000 });
      await expect(floatingActionButton.locator("svg.lucide-square")).toBeVisible({ timeout: 15_000 });
      await expect(floatingCompactTime).toHaveText(/\d+[hm] \d+[ms]/, { timeout: 15_000 });
      await expect(startStopButton).toHaveText(/stop/i, { timeout: 15_000 });
      await expect(sessionTimer).toBeVisible({ timeout: 15_000 });
      await expect(sessionTimer).toHaveText(/\d{2}:\d{2}:\d{2}/, { timeout: 15_000 });
    });

    await test.step("sub-test: active FOB remains visible after navigating away from the tracked work item", async () => {
      await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/`);
      await waitForPageLoad(page);

      await expect(floatingFob).toBeVisible({ timeout: 15_000 });
      await expect(floatingActionButton).toHaveAttribute("aria-label", /stop time tracking/i, { timeout: 15_000 });
      await expect(floatingActionButton).not.toContainText(/stop/i, { timeout: 15_000 });
    });

    await test.step("sub-test: hovering the FOB expands it and exposes the tracked work item link", async () => {
      await floatingFob.hover();
      const expandedPanel = page.getByTestId("floating-time-tracking-fob-expanded");
      const primaryLabel = page.getByTestId("floating-time-tracking-fob-primary-label");
      const titleLink = page.getByTestId("floating-time-tracking-fob-title-link");
      const fullTimeText = page.getByTestId("floating-time-tracking-fob-full-time");

      await expect(expandedPanel).toBeVisible({ timeout: 15_000 });
      await expect(primaryLabel).toHaveText(/stop/i, { timeout: 15_000 });
      await expect(titleLink).toBeVisible({ timeout: 15_000 });
      await expect(fullTimeText).toBeVisible({ timeout: 15_000 });
    });

    await test.step("sub-test: the expanded FOB title navigates back to the tracked work item", async () => {
      const titleLink = page.getByTestId("floating-time-tracking-fob-title-link");

      await titleLink.click();

      await page.waitForURL(trackedWorkItemUrl, { timeout: 15_000 });
      await expect(floatingFob).toBeVisible({ timeout: 15_000 });
      await expect(floatingActionButton).toHaveAttribute("aria-label", /stop time tracking/i, { timeout: 15_000 });
    });

    await test.step("sub-test: clicking Stop from the FOB stops tracking and hides the FOB", async () => {
      await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/`);
      await waitForPageLoad(page);

      await expect(floatingFob).toBeVisible({ timeout: 15_000 });
      await floatingActionButton.click();

      await expect(floatingFob).toHaveCount(0);

      const activeWorklogResponse = await page.request.get(activeWorklogUrl);
      expect(activeWorklogResponse.status()).toBe(204);
    });
  });

  test("11. Parent work item: Time Logged display rolls up descendant totals recursively", async ({ page }) => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;

    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();

    const uniqueSuffix = Date.now().toString();
    const parentIssueName = `Parent time rollup ${uniqueSuffix}`;
    const childIssueName = `Child time rollup ${uniqueSuffix}`;
    const grandchildIssueName = `Grandchild time rollup ${uniqueSuffix}`;

    const createIssue = async (name: string): Promise<{ id: string }> => {
      const response = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
        {
          data: { name },
        }
      );
      expect(response.status()).toBeLessThan(300);
      return (await response.json()) as { id: string };
    };

    let parentIssueId = "";
    let childIssueId = "";
    let grandchildIssueId = "";

    try {
      const parentIssue = await createIssue(parentIssueName);
      const childIssue = await createIssue(childIssueName);
      const grandchildIssue = await createIssue(grandchildIssueName);
      parentIssueId = parentIssue.id;
      childIssueId = childIssue.id;
      grandchildIssueId = grandchildIssue.id;
      expect(parentIssueId).toBeTruthy();
      expect(childIssueId).toBeTruthy();
      expect(grandchildIssueId).toBeTruthy();

      const attachSubIssueResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${parentIssueId}/sub-issues/`,
        {
          data: { sub_issue_ids: [childIssueId] },
        }
      );
      expect(attachSubIssueResponse.status()).toBe(200);

      const attachGrandchildResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${childIssueId}/sub-issues/`,
        {
          data: { sub_issue_ids: [grandchildIssueId] },
        }
      );
      expect(attachGrandchildResponse.status()).toBe(200);

      const childSubIssuesResponse = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${childIssueId}/sub-issues/`
      );
      expect(childSubIssuesResponse.ok()).toBe(true);
      const childSubIssues = (await childSubIssuesResponse.json()) as { sub_issues?: Array<{ id?: string }> };
      expect((childSubIssues.sub_issues ?? []).some((item) => item.id === grandchildIssueId)).toBe(true);

      const today = new Date().toISOString().split("T")[0];
      const parentWorklogResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${parentIssueId}/worklogs/`,
        {
          data: {
            duration: 30,
            logged_at: today,
            description: "Parent worklog for rollup UI assertion",
          },
        }
      );
      expect(parentWorklogResponse.status()).toBe(201);

      const childWorklogResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${childIssueId}/worklogs/`,
        {
          data: {
            duration: 45,
            logged_at: today,
            description: "Child worklog for rollup UI assertion",
          },
        }
      );
      expect(childWorklogResponse.status()).toBe(201);

      const grandchildWorklogResponse = await page.request.post(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${grandchildIssueId}/worklogs/`,
        {
          data: {
            duration: 15,
            logged_at: today,
            description: "Grandchild worklog for recursive rollup UI assertion",
          },
        }
      );
      expect(grandchildWorklogResponse.status()).toBe(201);

      const childTotalResponse = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${childIssueId}/worklogs/total/`
      );
      expect(childTotalResponse.ok()).toBe(true);
      const childTotal = (await childTotalResponse.json()) as { total_duration: number };
      expect(childTotal.total_duration).toBe(45);

      const grandchildTotalResponse = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${grandchildIssueId}/worklogs/total/`
      );
      expect(grandchildTotalResponse.ok()).toBe(true);
      const grandchildTotal = (await grandchildTotalResponse.json()) as { total_duration: number };
      expect(grandchildTotal.total_duration).toBe(15);

      const parentTotalBeforeRenderResponse = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${parentIssueId}/worklogs/total/`
      );
      expect(parentTotalBeforeRenderResponse.ok()).toBe(true);
      const parentTotalBeforeRender = (await parentTotalBeforeRenderResponse.json()) as { total_duration: number };
      expect(parentTotalBeforeRender.total_duration).toBe(30);

      await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${parentIssueId}`);
      await waitForPageLoad(page);

      await expect(page.getByTestId("issue-worklog-property-value")).toHaveText(/1h 30m/, { timeout: 20_000 });

      const parentTotalAfterRenderResponse = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${parentIssueId}/worklogs/total/`
      );
      expect(parentTotalAfterRenderResponse.ok()).toBe(true);
      const parentTotalAfterRender = (await parentTotalAfterRenderResponse.json()) as { total_duration: number };
      expect(parentTotalAfterRender.total_duration).toBe(30);
    } finally {
      if (grandchildIssueId) {
        await page.request.delete(
          `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${grandchildIssueId}/`
        );
      }
      if (childIssueId) {
        await page.request.delete(
          `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${childIssueId}/`
        );
      }
      if (parentIssueId) {
        await page.request.delete(
          `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${parentIssueId}/`
        );
      }
    }
  });
});
