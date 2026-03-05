/* eslint-disable turbo/no-undeclared-env-vars */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

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

type IssueResponse = {
  state_id?: string;
  start_date?: string | null;
  assignee_ids?: string[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

print(f"WORKLOG_SEED_RESULT:{workspace.slug}|{project.id}|{issue.id}")
`;

  const output = execFileSync(
    "podman",
    ["exec", "-w", "/", resolveApiContainerName(), "python", "/code/manage.py", "shell", "-c", seedScript],
    {
      encoding: "utf-8",
      cwd: "/",
    }
  );

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
  const maxAttempts = 5;
  let csrfToken = "";
  let lastCsrfStatus = -1;
  let lastCsrfBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const csrfResponse = await request.get(`${BASE_URL}/auth/get-csrf-token/`);
    lastCsrfStatus = csrfResponse.status();
    if (csrfResponse.ok()) {
      const csrfData = (await csrfResponse.json()) as { csrf_token?: string };
      csrfToken = csrfData.csrf_token ?? "";
      if (csrfToken) break;
    } else {
      lastCsrfBody = (await csrfResponse.text()).slice(0, 200);
    }
    if (attempt < maxAttempts) {
      await wait(500 * attempt);
    }
  }

  expect(
    csrfToken,
    `Unable to fetch CSRF token. lastStatus=${lastCsrfStatus} lastBody=${lastCsrfBody}`
  ).not.toBe("");

  let lastSignInStatus = -1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    lastSignInStatus = signInResponse.status();
    if ([200, 302].includes(lastSignInStatus)) {
      return;
    }
    if (attempt < maxAttempts) {
      await wait(500 * attempt);
    }
  }

  expect([200, 302]).toContain(lastSignInStatus);
}

function getWorklogBaseUrl(): string {
  return `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
}

function getIssueUrl(): string {
  return `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`;
}

function resetIssueTrackingDefaults(): {
  todoStateId: string;
  inProgressStateId: string;
  userId: string;
  today: string;
} {
  const resetScript = `
from django.utils import timezone
from plane.db.models.user import User
from plane.db.models.issue import Issue, IssueAssignee
from plane.db.models import IssueActivity
from plane.db.models.state import State
from plane.db.models.worklog import Worklog

issue = Issue.issue_objects.get(pk="${issueId}", project_id="${projectId}", workspace__slug="${workspaceSlug}")
user = User.objects.get(email="${ADMIN_EMAIL}".strip().lower())

todo_state = State.all_state_objects.filter(
    project_id=issue.project_id,
    name__iexact="Todo",
    deleted_at__isnull=True,
).order_by("sequence").first()
if todo_state is None:
    todo_state = State.all_state_objects.filter(
        project_id=issue.project_id,
        group="unstarted",
        deleted_at__isnull=True,
    ).order_by("sequence").first()
if todo_state is None:
    todo_state = State.all_state_objects.filter(project_id=issue.project_id, deleted_at__isnull=True).order_by("sequence").first()

in_progress_state = State.all_state_objects.filter(
    project_id=issue.project_id,
    name__iexact="In Progress",
    deleted_at__isnull=True,
).order_by("sequence").first()
if in_progress_state is None:
    in_progress_state = State.all_state_objects.filter(
        project_id=issue.project_id,
        group="started",
        deleted_at__isnull=True,
    ).order_by("sequence").first()
if in_progress_state is None:
    in_progress_state = State.all_state_objects.create(
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        name="In Progress",
        group="started",
        color="#f59e0b",
        sequence=1024,
        created_by=user,
        updated_by=user,
    )

if todo_state is not None:
    issue.state_id = todo_state.id
issue.start_date = None
issue.updated_by = user
issue.save(update_fields=["state", "start_date", "updated_by", "updated_at"])

IssueAssignee.objects.filter(issue=issue).delete()
IssueActivity.objects.filter(issue=issue, field="state").delete()
Worklog.objects.filter(
    workspace_id=issue.workspace_id,
    project_id=issue.project_id,
    issue_id=issue.id,
    actor_id=user.id,
    duration=0,
    deleted_at__isnull=True,
).delete()

print(f"WORKLOG_RESET_RESULT:{todo_state.id if todo_state else ''}|{in_progress_state.id}|{user.id}|{timezone.localdate()}")
`;

  const output = execFileSync(
    "podman",
    ["exec", "-w", "/", resolveApiContainerName(), "python", "/code/manage.py", "shell", "-c", resetScript],
    {
      encoding: "utf-8",
      cwd: "/",
    }
  );
  const match = output.match(/WORKLOG_RESET_RESULT:([^\n\r]+)/);
  if (!match?.[1]) {
    throw new Error(`Unable to parse reset output: ${output}`);
  }

  const [todoStateId, inProgressStateId, userId, today] = match[1].trim().split("|");
  if (!inProgressStateId || !userId || !today) {
    throw new Error(`Incomplete reset output: ${match[1]}`);
  }

  return { todoStateId, inProgressStateId, userId, today };
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
  test.beforeAll(() => {
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

  test("FR-6: start tracking auto-sets state/start date/assignee when missing", async ({ request }) => {
    const { inProgressStateId, userId, today } = resetIssueTrackingDefaults();

    const startResponse = await request.post(`${getWorklogBaseUrl()}start/`);
    expect(startResponse.status()).toBe(201);

    const issueResponse = await request.get(getIssueUrl());
    expect(issueResponse.status()).toBe(200);
    const issue = (await issueResponse.json()) as IssueResponse;

    expect(issue.state_id).toBe(inProgressStateId);
    expect(issue.start_date).toBe(today);
    expect(issue.assignee_ids ?? []).toContain(userId);

    const activeWorklogsResponse = await request.get(getWorklogBaseUrl());
    expect(activeWorklogsResponse.status()).toBe(200);
    const activeWorklogs = (await activeWorklogsResponse.json()) as Array<{
      id: string;
      duration: number;
      actor: string;
    }>;
    const activeForActor = activeWorklogs.find((item) => item.actor === userId && item.duration === 0);
    if (activeForActor) {
      const stopResponse = await request.post(`${getWorklogBaseUrl()}stop/`);
      expect(stopResponse.status()).toBe(200);
    }
  });

  test("FR-7: logging time auto-sets state/start date/assignee when missing", async ({ request }) => {
    const { inProgressStateId, userId, today } = resetIssueTrackingDefaults();
    const createResponse = await request.post(getWorklogBaseUrl(), {
      data: {
        duration: 15,
        logged_at: today,
        description: "Auto defaults test worklog",
      },
    });
    expect(createResponse.status()).toBe(201);
    const createdWorklog = (await createResponse.json()) as WorklogResponse;

    const issueResponse = await request.get(getIssueUrl());
    expect(issueResponse.status()).toBe(200);
    const issue = (await issueResponse.json()) as IssueResponse;

    expect(issue.state_id).toBe(inProgressStateId);
    expect(issue.start_date).toBe(today);
    expect(issue.assignee_ids ?? []).toContain(userId);

    const deleteResponse = await request.delete(`${getWorklogBaseUrl()}${createdWorklog.id}/`);
    expect(deleteResponse.status()).toBe(204);
  });
});
