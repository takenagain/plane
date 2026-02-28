/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8081";
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

type WorklogResponse = {
  id: string;
  duration: number;
  description?: string;
};

function ensureE2ESeedData(): { workspaceSlug: string; projectId: string; issueId: string } {
  const seedScript = `
import re
from plane.db.models.user import User, Profile
from plane.db.models.workspace import Workspace, WorkspaceMember
from plane.db.models.project import Project, ProjectMember
from plane.db.models.issue import Issue, IssueAssignee
from plane.db.models.state import State, DEFAULT_STATES

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

print(f"WORKLOG_SEED_RESULT:{workspace.slug}|{project.id}|{issue.id}")
`;

  const output = execFileSync("podman", ["exec", "api", "python", "manage.py", "shell", "-c", seedScript], {
    encoding: "utf-8",
  });

  const match = output.match(/WORKLOG_SEED_RESULT:([^\n\r]+)/);
  if (!match?.[1]) {
    throw new Error(`Unable to parse seeded identifiers: ${output}`);
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

async function signIn(request: APIRequestContext): Promise<void> {
  const csrfResponse = await request.get(`${BASE_URL}/auth/get-csrf-token/`);
  expect(csrfResponse.ok()).toBe(true);
  const csrfData = (await csrfResponse.json()) as { csrf_token?: string };
  const csrfToken = csrfData.csrf_token ?? "";
  expect(csrfToken).not.toBe("");

  const signInResponse = await request.post(`${BASE_URL}/auth/sign-in/`, {
    form: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    headers: {
      "X-CSRFToken": csrfToken,
      Referer: `${BASE_URL}/`,
    },
  });

  expect([200, 302]).toContain(signInResponse.status());
}

function getWorklogBaseUrl(): string {
  return `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
}

async function createWorklog(
  request: APIRequestContext,
  duration: number,
  description: string
): Promise<WorklogResponse> {
  const today = new Date().toISOString().split("T")[0];
  const response = await request.post(getWorklogBaseUrl(), {
    data: {
      duration,
      logged_at: today,
      description,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as WorklogResponse;
}

test.describe("Worklog API Tests", () => {
  test.beforeAll(async () => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    issueId = seeded.issueId;
  });

  test.beforeEach(async ({ request }) => {
    await signIn(request);
  });

  test("should authenticate as admin user", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/users/me/`);
    expect(response.status()).toBe(200);
    const me = (await response.json()) as { email?: string };
    expect(me.email).toBe(ADMIN_EMAIL);
  });

  test("FR-1: should create a worklog", async ({ request }) => {
    const worklog = await createWorklog(request, 60, "E2E test worklog");
    expect(worklog.duration).toBe(60);
    expect(worklog.description).toBe("E2E test worklog");

    const deleteResponse = await request.delete(`${getWorklogBaseUrl()}${worklog.id}/`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("FR-2: should list worklogs for an issue", async ({ request }) => {
    const response = await request.get(getWorklogBaseUrl());
    expect(response.status()).toBe(200);
    const worklogs = (await response.json()) as unknown;
    expect(Array.isArray(worklogs)).toBe(true);
  });

  test("FR-3: should get total duration for an issue", async ({ request }) => {
    const response = await request.get(`${getWorklogBaseUrl()}total/`);
    expect(response.status()).toBe(200);
    const total = (await response.json()) as { total_duration?: unknown };
    expect(typeof total.total_duration).toBe("number");
  });

  test("FR-4: should update a worklog", async ({ request }) => {
    const worklog = await createWorklog(request, 30, "Original description");
    const updateResponse = await request.patch(`${getWorklogBaseUrl()}${worklog.id}/`, {
      data: {
        duration: 45,
        description: "Updated description",
      },
    });

    expect(updateResponse.status()).toBe(200);
    const updated = (await updateResponse.json()) as WorklogResponse;
    expect(updated.duration).toBe(45);
    expect(updated.description).toBe("Updated description");

    const deleteResponse = await request.delete(`${getWorklogBaseUrl()}${worklog.id}/`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("FR-5: should delete a worklog", async ({ request }) => {
    const worklog = await createWorklog(request, 60, "To be deleted");
    const deleteResponse = await request.delete(`${getWorklogBaseUrl()}${worklog.id}/`);
    expect(deleteResponse.status()).toBe(204);

    const listResponse = await request.get(getWorklogBaseUrl());
    expect(listResponse.status()).toBe(200);
    const worklogs = (await listResponse.json()) as Array<{ id?: string }>;
    expect(worklogs.some((item) => item.id === worklog.id)).toBe(false);
  });

  test("Validation: should reject duration of 0", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    const response = await request.post(getWorklogBaseUrl(), {
      data: {
        duration: 0,
        logged_at: today,
      },
    });
    expect(response.status()).toBe(400);
  });

  test("Validation: should reject future date", async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const response = await request.post(getWorklogBaseUrl(), {
      data: {
        duration: 60,
        logged_at: futureDate.toISOString().split("T")[0],
      },
    });
    expect(response.status()).toBe(400);
  });
});
