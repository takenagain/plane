/* eslint-disable turbo/no-undeclared-env-vars */
/**
 * E2E tests for Analytics: Hours Logged chart & CSV export.
 *
 * This focuses on:
 * - Ensuring the HOURS_LOGGED analytics endpoint returns chart data.
 * - Ensuring the time-logged CSV export includes the expected columns and non-zero hours.
 *
 * It reuses the seeding and auth helpers from the main time-tracking E2E spec.
 */
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8081";
const API_BASE_URL = process.env.E2E_API_BASE_URL || BASE_URL;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "TestPass123!";
const ADMIN_FIRST_NAME = process.env.E2E_ADMIN_FIRST_NAME || "Admin";
const ADMIN_LAST_NAME = process.env.E2E_ADMIN_LAST_NAME || "User";
const COMPANY_NAME = process.env.E2E_COMPANY_NAME || "TestCompany";
const WORKSPACE_NAME = process.env.E2E_WORKSPACE_NAME || "test-ws";
const PROJECT_NAME = process.env.E2E_PROJECT_NAME || "Time Tracking QA";
const ISSUE_TITLE = process.env.E2E_ISSUE_TITLE || "Test time tracking issue";

let workspaceSlug = "";
let projectId = "";
let issueId = "";
let analyticsSeeded = false;

function resolveApiContainerName() {
  const output = execFileSync("podman", ["ps", "--format", "{{.Names}}"], { encoding: "utf-8" });
  const names = output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.find((name) => name === "api" || name.endsWith("_api_1")) || "api";
}

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

  const output = execFileSync(
    "podman",
    ["exec", resolveApiContainerName(), "python", "manage.py", "shell", "-c", seedScript],
    {
      encoding: "utf-8",
    }
  );
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

async function signInAndEnsureWorkspace(page: Page) {
  await page.goto(BASE_URL);
  await waitForPageLoad(page);

  const emailInput = page.getByPlaceholder("name@company.com").or(page.locator("input[type='email']")).first();
  if (await emailInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await emailInput.fill(ADMIN_EMAIL);
    const continueButton = page
      .locator("form button[type='submit']")
      .or(page.getByRole("button", { name: /continue/i }))
      .first();
    await continueButton.click();

    const passwordInput = page
      .locator("#password")
      .or(page.getByPlaceholder(/enter password|set a password|new password/i))
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
    await passwordInput.fill(ADMIN_PASSWORD);

    const submitButton = passwordInput
      .locator("xpath=ancestor::form[1]")
      .locator("button[type='submit']")
      .or(page.getByRole("button", { name: /go to workspace|sign in|continue|create account/i }))
      .first();
    await submitButton.click();
    await waitForPageLoad(page);
  }
}

async function signInViaApi(page: Page) {
  const csrfResponse = await page.request.get(`${API_BASE_URL}/auth/get-csrf-token/`);
  expect(csrfResponse.ok()).toBe(true);
  const csrfData = (await csrfResponse.json()) as { csrf_token?: string };
  const csrfToken = csrfData.csrf_token ?? "";
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
