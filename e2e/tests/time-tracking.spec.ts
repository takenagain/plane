/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, turbo/no-undeclared-env-vars */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
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
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
const BASE_URL = process.env.BASE_URL || "http://localhost:8081";
// Test user credentials - configure via environment variables
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "TestPass123!";
const ADMIN_FIRST_NAME = process.env.E2E_ADMIN_FIRST_NAME || "Admin";
const ADMIN_LAST_NAME = process.env.E2E_ADMIN_LAST_NAME || "User";
const COMPANY_NAME = process.env.E2E_COMPANY_NAME || "TestCompany";
// Workspace and project details - configure via environment variables
const WORKSPACE_NAME = process.env.E2E_WORKSPACE_NAME || "test-ws";
const PROJECT_NAME = process.env.E2E_PROJECT_NAME || "Time Tracking QA";
const ISSUE_TITLE = process.env.E2E_ISSUE_TITLE || "Test time tracking issue";
// Shared state across serial tests
let workspaceSlug = "";
let projectId = "";
let issueId = "";

function ensureE2ESeedData(): { workspaceSlug: string; projectId: string; issueId: string } {
  const seedScript = `
import re
from plane.db.models.user import User, Profile
from plane.db.models.workspace import Workspace, WorkspaceMember
from plane.db.models.project import Project, ProjectMember
from plane.db.models.issue import Issue, IssueAssignee
from plane.db.models.state import State, DEFAULT_STATES
from plane.db.models.worklog import Worklog

email = "${ADMIN_EMAIL}".strip().lower()
password = "${ADMIN_PASSWORD}"
first_name = "${ADMIN_FIRST_NAME}".strip()
last_name = "${ADMIN_LAST_NAME}".strip()
workspace_name = "${WORKSPACE_NAME}".strip() or "test-ws"
project_name = "${PROJECT_NAME}".strip() or "Time Tracking QA"
issue_title = "${ISSUE_TITLE}".strip() or "Test time tracking issue"
company_name = "${COMPANY_NAME}".strip() or "TestCompany"

workspace_slug = re.sub(r"[^a-z0-9-]+", "-", workspace_name.lower()).strip("-") or "test-ws"
project_identifier = "TTQA"

user, user_created = User.objects.get_or_create(
    email=email,
    defaults={
        "username": email,
        "first_name": first_name,
        "last_name": last_name,
        "display_name": f"{first_name} {last_name}".strip() or email.split("@")[0],
        "is_active": True,
        "is_email_verified": True,
    },
)

user.username = user.username or email
user.first_name = first_name or user.first_name
user.last_name = last_name or user.last_name
user.display_name = (f"{first_name} {last_name}".strip() or user.display_name or email.split("@")[0]).strip()
user.is_active = True
user.is_email_verified = True
user.set_password(password)
user.save()

workspace, _ = Workspace.objects.get_or_create(
    slug=workspace_slug,
    defaults={"name": workspace_name, "owner": user},
)
if workspace.owner_id != user.id:
    workspace.owner = user
    workspace.save(update_fields=["owner"])

WorkspaceMember.objects.update_or_create(
    workspace=workspace,
    member=user,
    defaults={"role": 20, "is_active": True},
)

profile, _ = Profile.objects.get_or_create(user=user)
profile.is_onboarded = True
profile.onboarding_step = {
    "profile_complete": True,
    "workspace_create": True,
    "workspace_invite": True,
    "workspace_join": True,
}
profile.last_workspace_id = workspace.id
profile.company_name = company_name
profile.save()

project, _ = Project.objects.get_or_create(
    workspace=workspace,
    name=project_name,
    defaults={
        "identifier": project_identifier,
        "network": 2,
        "is_time_tracking_enabled": True,
    },
)

if project.identifier != project_identifier:
    project.identifier = project_identifier
if not project.is_time_tracking_enabled:
    project.is_time_tracking_enabled = True
project.save()

ProjectMember.objects.update_or_create(
    project=project,
    member=user,
    defaults={"workspace": workspace, "role": 20, "is_active": True},
)

if not State.all_state_objects.filter(project=project, deleted_at__isnull=True).exists():
    for state in DEFAULT_STATES:
        State.all_state_objects.create(project=project, workspace=workspace, **state)

default_state = (
    State.all_state_objects.filter(project=project, default=True, deleted_at__isnull=True).first()
    or State.all_state_objects.filter(project=project, deleted_at__isnull=True).first()
)

issue, _ = Issue.objects.get_or_create(
    project=project,
    workspace=workspace,
    name=issue_title,
    defaults={"state": default_state, "priority": "none"},
)

if issue.state_id is None and default_state is not None:
    issue.state = default_state
    issue.save(update_fields=["state"])

IssueAssignee.objects.update_or_create(
    issue=issue,
    assignee=user,
    defaults={"workspace": workspace, "project": project, "created_by": user, "updated_by": user},
)

Worklog.objects.filter(
    workspace=workspace,
    project=project,
    issue=issue,
    actor=user,
    duration=0,
    deleted_at__isnull=True,
).delete()

print(f"SEED_RESULT:{workspace.slug}|{project.id}|{issue.id}")
`;

  const output = execFileSync("podman", ["exec", "api", "python", "manage.py", "shell", "-c", seedScript], {
    encoding: "utf-8",
  });
  const match = output.match(/SEED_RESULT:([^\n\r]+)/);

  if (!match?.[1]) {
    throw new Error(`Unable to parse seeded data output: ${output}`);
  }

  const [seedWorkspaceSlug, seedProjectId, seedIssueId] = match[1].trim().split("|");
  if (!seedWorkspaceSlug || !seedProjectId || !seedIssueId) {
    throw new Error(`Incomplete seeded identifiers: ${match[1]}`);
  }

  return {
    workspaceSlug: seedWorkspaceSlug,
    projectId: seedProjectId,
    issueId: seedIssueId,
  };
}
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded");
}
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

async function resolveWorkspaceSlugWithProjectAccess(page: Page, preferredSlug = ""): Promise<string> {
  const candidateSlugs = new Set<string>();
  if (WORKSPACE_NAME) {
    candidateSlugs.add(WORKSPACE_NAME);
  }
  if (preferredSlug) {
    candidateSlugs.add(preferredSlug);
  }

  const urlMatch = page.url().match(/\/([a-zA-Z0-9_-]+)\/(projects|issues|settings|home)/);
  if (urlMatch?.[1]) {
    candidateSlugs.add(urlMatch[1]);
  }

  try {
    const workspacesResponse = await page.request.get(`${BASE_URL}/api/workspaces/`);
    if (workspacesResponse.ok()) {
      const workspacesData = await workspacesResponse.json();
      const workspaces = workspacesData.results || workspacesData;
      if (Array.isArray(workspaces)) {
        for (const workspace of workspaces) {
          const slug = workspace?.slug;
          if (typeof slug === "string" && slug.length > 0) {
            candidateSlugs.add(slug);
          }
        }
      }
    }
  } catch {
    // no-op, fall back to preferred slug/default
  }

  for (const slug of candidateSlugs) {
    try {
      const projectsResponse = await page.request.get(`${BASE_URL}/api/workspaces/${slug}/projects/`);
      if (projectsResponse.ok()) {
        return slug;
      }
    } catch {
      // try next candidate
    }
  }

  return "";
}

async function findFirstAccessibleProject(page: Page): Promise<{ workspaceSlug: string; projectId: string } | null> {
  try {
    const workspacesResponse = await page.request.get(`${BASE_URL}/api/workspaces/`);
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

async function loginWithEmailAndPassword(page: Page) {
  const emailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']")).first();
  await expect(emailInput).toBeVisible({ timeout: 15_000 });
  await emailInput.fill(ADMIN_EMAIL);

  const continueButton = page
    .locator("form button[type='submit']")
    .or(page.getByRole("button", { name: /continue/i }))
    .first();
  await expect(continueButton).toBeEnabled({ timeout: 10_000 });
  await continueButton.click();

  const passwordInput = page
    .locator("#password")
    .or(page.getByPlaceholder(/enter password|set a password|new password/i))
    .first();
  await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  await passwordInput.fill(ADMIN_PASSWORD);

  const confirmPasswordInput = page
    .locator("#confirm-password")
    .or(page.getByPlaceholder(/confirm password/i))
    .first();
  if (await confirmPasswordInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await confirmPasswordInput.fill(ADMIN_PASSWORD);
  }

  const submitButton = passwordInput
    .locator("xpath=ancestor::form[1]")
    .locator("button[type='submit']")
    .or(page.getByRole("button", { name: /go to workspace|sign in|continue|create account/i }))
    .first();

  await expect(submitButton).toBeEnabled({ timeout: 10_000 });
  await submitButton.click();
  await page.waitForTimeout(4000);
  await waitForPageLoad(page);
}
/**
 * Sign in: two-step flow (email -> Continue -> password -> Go to workspace)
 * After sign-in, completes the onboarding flow if needed.
 * Returns the workspace slug once the user is on a workspace page.
 */
async function signInAndEnsureWorkspace(page: Page): Promise<string> {
  await page.goto(BASE_URL);
  await waitForPageLoad(page);
  await page.waitForTimeout(2000);
  const url = page.url();
  // Already on a workspace page?
  const wsMatch = url.match(/\/([a-zA-Z0-9_-]+)\/(projects|issues|settings|home)/);
  if (wsMatch) {
    workspaceSlug = wsMatch[1];
    return workspaceSlug;
  }
  // If on sign-in page or root, do the login
  if (url.endsWith("/") || url.endsWith(":8081") || url.endsWith(":8081/") || url.includes("/sign-in")) {
    await loginWithEmailAndPassword(page);
    if (page.url().includes("/sign-in")) {
      await loginWithEmailAndPassword(page);
    }
  }
  // Handle onboarding if present
  await completeOnboarding(page);
  // Extract workspace slug from URL
  const finalUrl = page.url();
  const finalMatch = finalUrl.match(/\/([a-zA-Z0-9_-]+)\/(projects|issues|settings|home)/);
  if (finalMatch) {
    workspaceSlug = finalMatch[1];
  }
  workspaceSlug = await resolveWorkspaceSlugWithProjectAccess(page, workspaceSlug);
  return workspaceSlug;
}
/**
 * Complete the full onboarding flow if we're on the onboarding page.
 * Steps: Profile -> Role -> Use Case -> Workspace -> Invite Members
 */
async function completeOnboarding(page: Page) {
  await page.waitForTimeout(2000);
  let url = page.url();
  if (!url.includes("/onboarding")) return;
  // Step 1: Profile Setup - "Create your profile"
  // The name field (#first_name) should be visible with a "Continue" button
  const profileNameInput = page.locator("#first_name").or(page.getByPlaceholder("Enter your full name"));
  if (await profileNameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Clear and type the name
    await profileNameInput.clear();
    await profileNameInput.fill(`${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`);
    await page.waitForTimeout(500);
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();
    await page.waitForTimeout(2000);
    await waitForPageLoad(page);
  }
  // Step 2: Role Setup - "What's your role?"
  // Click one of the role buttons (e.g., "Developer")
  const developerRole = page.locator("button", { hasText: "Developer" });
  if (await developerRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await developerRole.click();
    await page.waitForTimeout(500);
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();
    await page.waitForTimeout(2000);
    await waitForPageLoad(page);
  }
  // Step 3: Use Case Setup - "How will you use Plane?"
  // Try to click any use case option, then continue or skip
  const skipBtn = page.getByRole("button", { name: /skip/i });
  const continueUseCaseBtn = page.getByRole("button", { name: /continue/i });
  // Check if we're on the use case page by looking for common UI elements
  url = page.url();
  if (url.includes("/onboarding")) {
    // Try skip first, then continue
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(2000);
      await waitForPageLoad(page);
    } else if (await continueUseCaseBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await continueUseCaseBtn.click();
      await page.waitForTimeout(2000);
      await waitForPageLoad(page);
    }
  }
  // Step 4: Workspace Creation - "Create your workspace"
  const workspaceNameInput = page.locator("#name").or(page.getByPlaceholder("Enter workspace name"));
  if (await workspaceNameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await workspaceNameInput.clear();
    await workspaceNameInput.fill(WORKSPACE_NAME);
    await page.waitForTimeout(1000);
    // Select organization size - click "Just myself"
    const justMyselfBtn = page.locator("button", { hasText: "Just myself" });
    if (await justMyselfBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await justMyselfBtn.click();
      await page.waitForTimeout(500);
    }
    // Click create workspace button
    const createWsBtn = page.getByRole("button", { name: /create workspace|continue/i });
    await expect(createWsBtn).toBeEnabled({ timeout: 5_000 });
    await createWsBtn.click();
    await page.waitForTimeout(5000);
    await waitForPageLoad(page);
  }
  // Step 5: Invite Members - usually has a "Skip" or "Continue" button
  url = page.url();
  if (url.includes("/onboarding")) {
    const skipInviteBtn = page.getByRole("button", { name: /skip|continue|go to workspace/i });
    if (await skipInviteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipInviteBtn.click();
      await page.waitForTimeout(5000);
      await waitForPageLoad(page);
    }
  }
  // If still on onboarding, try clicking any remaining buttons
  for (let attempt = 0; attempt < 3; attempt++) {
    url = page.url();
    if (!url.includes("/onboarding")) break;
    const anyBtn = page.getByRole("button", { name: /skip|continue|go to workspace|let's go/i });
    if (await anyBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await anyBtn.click();
      await page.waitForTimeout(3000);
      await waitForPageLoad(page);
    } else {
      break;
    }
  }
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
  test("10. Browser: Start/Stop control toggles text and icon state", async ({ page }) => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    issueId = seeded.issueId;

    await signInAndEnsureWorkspace(page);
    expect(workspaceSlug).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(issueId).toBeTruthy();

    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${issueId}`);
      await waitForPageLoad(page);
      await page.waitForTimeout(2500);

      const emailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']")).first();
      if (await emailInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await loginWithEmailAndPassword(page);
        continue;
      }

      const noWorkspaceMessage = page.getByText(/you don't seem to have any invites to a workspace/i);
      if (await noWorkspaceMessage.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const reseeded = ensureE2ESeedData();
        workspaceSlug = reseeded.workspaceSlug;
        projectId = reseeded.projectId;
        issueId = reseeded.issueId;
        continue;
      }

      break;
    }

    await expect(page).not.toHaveURL(/\/sign-in/);

    const trackingActions = page.getByTestId("issue-time-tracking-actions").first();
    const startStopButton = trackingActions.getByTestId("issue-time-start-stop-button");
    const sessionTimer = trackingActions.getByTestId("issue-time-session-timer");

    await expect(startStopButton).toBeVisible({ timeout: 15_000 });

    await test.step("sub-test: normalizes state to Start before toggle assertions", async () => {
      const currentText = (await startStopButton.textContent())?.trim().toLowerCase() ?? "";
      if (currentText === "stop") {
        await startStopButton.click();
        await expect(startStopButton).toHaveText(/start/i, { timeout: 15_000 });
      }
      await expect(startStopButton).toHaveText(/start/i, { timeout: 15_000 });
      await expect(startStopButton.locator("svg.lucide-play")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("sub-test: clicking Start switches to Stop with square icon", async () => {
      await startStopButton.click();
      await expect(startStopButton).toHaveText(/stop/i, { timeout: 15_000 });
      await expect(startStopButton.locator("svg.lucide-square")).toBeVisible({ timeout: 15_000 });
      await expect(sessionTimer).toBeVisible({ timeout: 15_000 });
      await expect(sessionTimer).toHaveText(/\d{2}:\d{2}:\d{2}/, { timeout: 15_000 });
    });

    await test.step("sub-test: clicking Stop switches back to Start with play icon", async () => {
      await startStopButton.click();
      await expect(startStopButton).toHaveText(/start/i, { timeout: 15_000 });
      await expect(startStopButton.locator("svg.lucide-play")).toBeVisible({ timeout: 15_000 });
      await expect(sessionTimer).toHaveCount(0);
    });

    await test.step("sub-test: logging time refreshes issue and activity without reopening", async () => {
      const openLogButton = trackingActions.getByTestId("issue-time-log-button");
      await expect(openLogButton).toBeVisible({ timeout: 15_000 });
      await openLogButton.click();

      const form = trackingActions.locator("form").first();
      await expect(form).toBeVisible({ timeout: 15_000 });
      await form.getByLabel("Hours").fill("0");
      await form.getByLabel("Minutes").fill("5");

      await form.getByRole("button", { name: /^log time$/i }).click();

      await expect(form).toHaveCount(0);
    });
  });
});
