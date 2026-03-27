/* eslint-disable turbo/no-undeclared-env-vars */
/* oxlint-disable no-await-in-loop */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const BASE_URL = process.env.BASE_URL || "http://localhost:8081";
export const API_BASE_URL = process.env.E2E_API_BASE_URL || BASE_URL;

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "TestPass123!";
export const ADMIN_FIRST_NAME = process.env.E2E_ADMIN_FIRST_NAME || "Admin";
export const ADMIN_LAST_NAME = process.env.E2E_ADMIN_LAST_NAME || "User";
export const COMPANY_NAME = process.env.E2E_COMPANY_NAME || "TestCompany";

export const WORKSPACE_NAME = process.env.E2E_WORKSPACE_NAME || "test-ws";
export const PROJECT_NAME = process.env.E2E_PROJECT_NAME || "Time Tracking QA";
export const ISSUE_TITLE = process.env.E2E_ISSUE_TITLE || "Test time tracking issue";

function extractWorkspaceSlugs(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = "results" in payload ? (payload as { results?: unknown }).results : payload;
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((workspace) => {
      if (!workspace || typeof workspace !== "object") {
        return "";
      }
      const slug = (workspace as { slug?: unknown }).slug;
      return typeof slug === "string" ? slug : "";
    })
    .filter((slug) => slug.length > 0);
}

function detectContainerRuntime(): string {
  const envRuntime = process.env.CONTAINER_RUNTIME;
  if (envRuntime) return envRuntime;
  for (const runtime of ["podman", "docker"]) {
    try {
      execFileSync(runtime, ["--version"], { encoding: "utf-8", stdio: "pipe" });
      return runtime;
    } catch {
      // not available, try next
    }
  }
  throw new Error("Neither podman nor docker is available");
}

function resolveApiContainerName() {
  const runtime = detectContainerRuntime();
  const output = execFileSync(runtime, ["ps", "--format", "{{.Names}}"], { encoding: "utf-8" });
  const names = output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  return { runtime, container: names.find((name) => name === "api" || name.endsWith("_api_1")) || "api" };
}

export function ensureE2ESeedData(): { workspaceSlug: string; projectId: string; issueId: string } {
  const seedScript = `
import re
from django.core.cache import cache
from plane.db.models.user import User, Profile
from plane.db.models.workspace import Workspace, WorkspaceMember
from plane.db.models.project import Project, ProjectMember
from plane.db.models.issue import Issue, IssueAssignee
from plane.db.models.state import State, DEFAULT_STATES
from plane.db.models.worklog import Worklog
from plane.license.models import Instance, InstanceAdmin

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

user, _ = User.objects.get_or_create(
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

instance, _ = Instance.objects.get_or_create(
    defaults={
        "instance_name": company_name,
        "is_setup_done": True,
        "is_signup_screen_visited": True,
    },
)
instance.instance_name = company_name
instance.is_setup_done = True
instance.is_signup_screen_visited = True
instance.save(update_fields=["instance_name", "is_setup_done", "is_signup_screen_visited", "updated_at"])

InstanceAdmin.objects.update_or_create(
    instance=instance,
    user=user,
    defaults={"role": 20},
)
cache.clear()

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
WorkspaceMember.objects.filter(member=user).exclude(workspace=workspace).delete()
WorkspaceMember.objects.filter(workspace=workspace).exclude(member=user).delete()
workspace_members = WorkspaceMember.objects.filter(workspace=workspace, member=user).order_by("id")
if workspace_members.count() > 1:
    workspace_members.exclude(id=workspace_members.first().id).delete()

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
ProjectMember.objects.filter(member=user).exclude(project=project).delete()
ProjectMember.objects.filter(project=project).exclude(member=user).delete()
project_members = ProjectMember.objects.filter(project=project, member=user).order_by("id")
if project_members.count() > 1:
    project_members.exclude(id=project_members.first().id).delete()

if not State.all_state_objects.filter(project=project, deleted_at__isnull=True).exists():
    for state in DEFAULT_STATES:
        State.all_state_objects.create(project=project, workspace=workspace, **state)

default_state = (
    State.all_state_objects.filter(project=project, default=True, deleted_at__isnull=True).first()
    or State.all_state_objects.filter(project=project, deleted_at__isnull=True).first()
)

issue = (
    Issue.issue_objects.filter(project=project, workspace=workspace, name=issue_title)
    .order_by("-updated_at", "-created_at")
    .first()
)
if issue is None:
    issue = Issue.objects.create(
        project=project,
        workspace=workspace,
        name=issue_title,
        state=default_state,
        priority="none",
        created_by=user,
        updated_by=user,
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

  const { runtime, container } = resolveApiContainerName();
  const output = execFileSync(
    runtime,
    ["exec", "-w", "/", container, "python", "/code/manage.py", "shell", "-c", seedScript],
    {
      encoding: "utf-8",
      cwd: "/",
    }
  );
  const match = output.match(/SEED_RESULT:([^\n\r]+)/);

  if (!match?.[1]) {
    throw new Error(`Unable to parse seeded data output: ${output}`);
  }

  const [workspaceSlug, projectId, issueId] = match[1].trim().split("|");
  if (!workspaceSlug || !projectId || !issueId) {
    throw new Error(`Incomplete seeded identifiers: ${match[1]}`);
  }

  return {
    workspaceSlug,
    projectId,
    issueId,
  };
}

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded");
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
    const workspaceEndpoints = ["/api/users/me/workspaces/", "/api/workspaces/"];
    for (const endpoint of workspaceEndpoints) {
      const workspacesResponse = await page.request.get(`${BASE_URL}${endpoint}`);
      if (!workspacesResponse.ok()) {
        continue;
      }
      const workspacesData: unknown = await workspacesResponse.json();
      for (const slug of extractWorkspaceSlugs(workspacesData)) {
        candidateSlugs.add(slug);
      }
      if (candidateSlugs.size > 0) {
        break;
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

async function loginWithEmailAndPassword(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const emailInput = page
      .getByPlaceholder("name@company.com")
      .or(page.locator("input[type='email'], input[name='email'], #email"))
      .first();

    if (!(await emailInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
      await page.goto(`${BASE_URL}/sign-in`);
      await waitForPageLoad(page);
      await page.waitForTimeout(1000);
      continue;
    }

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
    return;
  }

  throw new Error("Unable to find sign-in email form");
}

async function completeOnboarding(page: Page) {
  await page.waitForTimeout(2000);
  let url = page.url();
  if (!url.includes("/onboarding")) return;

  const profileNameInput = page.locator("#first_name").or(page.getByPlaceholder("Enter your full name"));
  if (await profileNameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await profileNameInput.clear();
    await profileNameInput.fill(`${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`);
    await page.waitForTimeout(500);
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();
    await page.waitForTimeout(2000);
    await waitForPageLoad(page);
  }

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

  const skipBtn = page.getByRole("button", { name: /skip/i });
  const continueUseCaseBtn = page.getByRole("button", { name: /continue/i });
  url = page.url();
  if (url.includes("/onboarding")) {
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

  const workspaceNameInput = page.locator("#name").or(page.getByPlaceholder("Enter workspace name"));
  if (await workspaceNameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await workspaceNameInput.clear();
    await workspaceNameInput.fill(WORKSPACE_NAME);
    await page.waitForTimeout(1000);

    const justMyselfBtn = page.locator("button", { hasText: "Just myself" });
    if (await justMyselfBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await justMyselfBtn.click();
      await page.waitForTimeout(500);
    }

    const createWsBtn = page.getByRole("button", { name: /create workspace|continue/i });
    await expect(createWsBtn).toBeEnabled({ timeout: 5_000 });
    await createWsBtn.click();
    await page.waitForTimeout(5000);
    await waitForPageLoad(page);
  }

  url = page.url();
  if (url.includes("/onboarding")) {
    const skipInviteBtn = page.getByRole("button", { name: /skip|continue|go to workspace/i });
    if (await skipInviteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipInviteBtn.click();
      await page.waitForTimeout(5000);
      await waitForPageLoad(page);
    }
  }

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

export async function signInAndEnsureWorkspace(page: Page): Promise<string> {
  await page.goto(BASE_URL);
  await waitForPageLoad(page);
  await page.waitForTimeout(2000);
  const url = page.url();

  const wsMatch = url.match(/\/([a-zA-Z0-9_-]+)\/(projects|issues|settings|home)/);
  if (wsMatch) {
    return wsMatch[1];
  }

  const resolvedWorkspace = await resolveWorkspaceSlugWithProjectAccess(page);
  if (resolvedWorkspace) {
    return resolvedWorkspace;
  }

  try {
    await signInViaApi(page);
    await page.goto(BASE_URL);
    await waitForPageLoad(page);
    await page.waitForTimeout(1000);

    const workspaceAfterApiSignIn = await resolveWorkspaceSlugWithProjectAccess(page);
    if (workspaceAfterApiSignIn) {
      return workspaceAfterApiSignIn;
    }
  } catch {
    // Fall back to UI login flow below.
  }

  if (url.includes("/sign-in")) {
    await loginWithEmailAndPassword(page);
  } else {
    await page.goto(`${BASE_URL}/sign-in`);
    await waitForPageLoad(page);
    await loginWithEmailAndPassword(page);
  }

  if (page.url().includes("/sign-in")) {
    await loginWithEmailAndPassword(page);
  }

  await completeOnboarding(page);

  const finalUrl = page.url();
  const finalMatch = finalUrl.match(/\/([a-zA-Z0-9_-]+)\/(projects|issues|settings|home)/);
  const slugFromUrl = finalMatch?.[1] ?? "";

  const resolvedFinalWorkspace = await resolveWorkspaceSlugWithProjectAccess(page, slugFromUrl);
  return resolvedFinalWorkspace || slugFromUrl;
}

export async function signInViaApi(page: Page) {
  let apiReady = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const instancesResponse = await page.request.get(`${API_BASE_URL}/api/instances/`);
      if (instancesResponse.ok()) {
        apiReady = true;
        break;
      }
    } catch {
      // API may not be fully ready yet.
    }
    await page.waitForTimeout(1000);
  }
  expect(apiReady).toBe(true);

  let csrfToken = "";
  for (let attempt = 0; attempt < 15; attempt++) {
    const csrfResponse = await page.request.get(`${API_BASE_URL}/auth/get-csrf-token/`);
    if (!csrfResponse.ok()) {
      await page.waitForTimeout(1000);
      continue;
    }

    const csrfData = (await csrfResponse.json()) as { csrf_token?: string };
    csrfToken = csrfData.csrf_token ?? "";
    if (!csrfToken) {
      const setCookieHeader = csrfResponse.headers()["set-cookie"] ?? "";
      const cookieMatch = setCookieHeader.match(/csrftoken=([^;]+)/);
      csrfToken = cookieMatch?.[1] ?? "";
    }
    if (csrfToken) {
      break;
    }
    await page.waitForTimeout(1000);
  }
  expect(csrfToken).not.toBe("");

  const signInResponse = await page.request.post(`${API_BASE_URL}/auth/sign-in/`, {
    form: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    headers: {
      "X-CSRFToken": csrfToken,
      Referer: `${API_BASE_URL}/`,
    },
  });
  expect([200, 302]).toContain(signInResponse.status());
}
