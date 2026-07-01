/* eslint-disable turbo/no-undeclared-env-vars */
import { execFileSync } from "node:child_process";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ensureE2ESeedData, resolveApiContainerName, signInApiRequest } from "./helpers/time-tracking";

const BASE_URL = process.env.BASE_URL || "http://localhost:8081";

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

  const { runtime, container } = resolveApiContainerName();
  const output = execFileSync(
    runtime,
    ["exec", "-w", "/", container, "python", "/code/manage.py", "shell", "-c", resetScript],
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
  let sharedRequest: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    issueId = seeded.issueId;
    sharedRequest = await playwright.request.newContext();
    await signInApiRequest(sharedRequest, BASE_URL);
  });

  test.afterAll(async () => {
    await sharedRequest.dispose();
  });

  test("should authenticate as admin user", async () => {
    const response = await sharedRequest.get(`${BASE_URL}/api/users/me/`);
    expect(response.status()).toBe(200);
    const me = (await response.json()) as { email?: string };
    expect(me.email).toBe(ADMIN_EMAIL);
  });

  test("FR-1: should create a worklog", async () => {
    const worklog = await createWorklog(sharedRequest, 60, "E2E test worklog");
    expect(worklog.duration).toBe(60);
    expect(worklog.description).toBe("E2E test worklog");

    const deleteResponse = await sharedRequest.delete(`${getWorklogBaseUrl()}${worklog.id}/`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("FR-2: should list worklogs for an issue", async () => {
    const response = await sharedRequest.get(getWorklogBaseUrl());
    expect(response.status()).toBe(200);
    const worklogs = (await response.json()) as unknown;
    expect(Array.isArray(worklogs)).toBe(true);
  });

  test("FR-3: should get total duration for an issue", async () => {
    const response = await sharedRequest.get(`${getWorklogBaseUrl()}total/`);
    expect(response.status()).toBe(200);
    const total = (await response.json()) as { total_duration?: unknown };
    expect(typeof total.total_duration).toBe("number");
  });

  test("FR-4: should update a worklog", async () => {
    const worklog = await createWorklog(sharedRequest, 30, "Original description");
    const updateResponse = await sharedRequest.patch(`${getWorklogBaseUrl()}${worklog.id}/`, {
      data: {
        duration: 45,
        description: "Updated description",
      },
    });

    expect(updateResponse.status()).toBe(200);
    const updated = (await updateResponse.json()) as WorklogResponse;
    expect(updated.duration).toBe(45);
    expect(updated.description).toBe("Updated description");

    const deleteResponse = await sharedRequest.delete(`${getWorklogBaseUrl()}${worklog.id}/`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("FR-5: should delete a worklog", async () => {
    const worklog = await createWorklog(sharedRequest, 60, "To be deleted");
    const deleteResponse = await sharedRequest.delete(`${getWorklogBaseUrl()}${worklog.id}/`);
    expect(deleteResponse.status()).toBe(204);

    const listResponse = await sharedRequest.get(getWorklogBaseUrl());
    expect(listResponse.status()).toBe(200);
    const worklogs = (await listResponse.json()) as Array<{ id?: string }>;
    expect(worklogs.some((item) => item.id === worklog.id)).toBe(false);
  });

  test("Validation: should reject duration of 0", async () => {
    const today = new Date().toISOString().split("T")[0];
    const response = await sharedRequest.post(getWorklogBaseUrl(), {
      data: {
        duration: 0,
        logged_at: today,
      },
    });
    expect(response.status()).toBe(400);
  });

  test("Validation: should reject future date", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const response = await sharedRequest.post(getWorklogBaseUrl(), {
      data: {
        duration: 60,
        logged_at: futureDate.toISOString().split("T")[0],
      },
    });
    expect(response.status()).toBe(400);
  });

  test("FR-6: start tracking auto-sets state/start date/assignee when missing", async () => {
    const { inProgressStateId, userId, today } = resetIssueTrackingDefaults();

    const startResponse = await sharedRequest.post(`${getWorklogBaseUrl()}start/`);
    expect(startResponse.status()).toBe(201);

    const issueResponse = await sharedRequest.get(getIssueUrl());
    expect(issueResponse.status()).toBe(200);
    const issue = (await issueResponse.json()) as IssueResponse;

    expect(issue.state_id).toBe(inProgressStateId);
    expect(issue.start_date).toBe(today);
    expect(issue.assignee_ids ?? []).toContain(userId);

    const activeWorklogsResponse = await sharedRequest.get(getWorklogBaseUrl());
    expect(activeWorklogsResponse.status()).toBe(200);
    const activeWorklogs = (await activeWorklogsResponse.json()) as Array<{
      id: string;
      duration: number;
      actor: string;
    }>;
    const activeForActor = activeWorklogs.find((item) => item.actor === userId && item.duration === 0);
    if (activeForActor) {
      const stopResponse = await sharedRequest.post(`${getWorklogBaseUrl()}stop/`);
      expect(stopResponse.status()).toBe(200);
    }
  });

  test("FR-7: logging time auto-sets state/start date/assignee when missing", async () => {
    const { inProgressStateId, userId, today } = resetIssueTrackingDefaults();
    const createResponse = await sharedRequest.post(getWorklogBaseUrl(), {
      data: {
        duration: 15,
        logged_at: today,
        description: "Auto defaults test worklog",
      },
    });
    expect(createResponse.status()).toBe(201);
    const createdWorklog = (await createResponse.json()) as WorklogResponse;

    const issueResponse = await sharedRequest.get(getIssueUrl());
    expect(issueResponse.status()).toBe(200);
    const issue = (await issueResponse.json()) as IssueResponse;

    expect(issue.state_id).toBe(inProgressStateId);
    expect(issue.start_date).toBe(today);
    expect(issue.assignee_ids ?? []).toContain(userId);

    const deleteResponse = await sharedRequest.delete(`${getWorklogBaseUrl()}${createdWorklog.id}/`);
    expect(deleteResponse.status()).toBe(204);
  });
});
