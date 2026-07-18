/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
/**
 * E2E Tests for Recurring Work Item Feature
 *
 * Coverage:
 * 1. Configure recurrence on a work item (set due date, set cadence, set max repetitions).
 * 2. Verify duplicate creation after a short test interval ("every_minute" cadence).
 * 3. Verify max repetition exhaustion behavior.
 *
 * Prerequisites:
 * - Podman containers running via docker-compose.yml / podman-compose.
 * - Plane accessible at http://localhost:8081 (or BASE_URL env var).
 * - Celery worker and beat running so background tasks fire.
 *
 * Notes:
 * - "every_minute" and "once" cadences are test-only and only available when
 *   NODE_ENV !== "production" on the frontend and DEBUG=True on the backend.
 * - Duplicate creation tests directly invoke the background task via the Django
 *   shell so they do not depend on a running Celery beat scheduler.
 */

import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  ensureE2ESeedData,
  signInAndEnsureWorkspace,
  signInViaApi,
  waitForPageLoad,
} from "./helpers/time-tracking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function farFutureDateIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function detectRuntime(): string {
  const envRuntime = process.env.CONTAINER_RUNTIME;
  if (envRuntime) return envRuntime;
  for (const runtime of ["podman", "docker"]) {
    try {
      execFileSync(runtime, ["--version"], { encoding: "utf-8", stdio: "pipe" });
      return runtime;
    } catch {
      // not available
    }
  }
  throw new Error("Neither podman nor docker is available");
}

const CONTAINER_RUNTIME = detectRuntime();

function resolveApiContainerName(): string {
  try {
    const output = execFileSync(CONTAINER_RUNTIME, ["ps", "--format", "{{.Names}}"], { encoding: "utf-8" });
    const names = output
      .split(/\r?\n/)
      .map((n: string) => n.trim())
      .filter(Boolean);
    return (
      (names as string[]).find((n: string) => n === "api" || n.endsWith("-api-1") || n.endsWith("_api_1")) ?? "api"
    );
  } catch {
    return "api";
  }
}

function runDjangoShell(script: string): string {
  return execFileSync(
    CONTAINER_RUNTIME,
    ["exec", "-w", "/", resolveApiContainerName(), "python", "/code/manage.py", "shell", "-c", script],
    { encoding: "utf-8", cwd: "/" }
  );
}

interface RecurrenceIssue {
  id: string;
  workspaceSlug: string;
  projectId: string;
  sequenceId: number;
}

function createRecurringIssueViaShell(opts: {
  workspaceSlug: string;
  projectId: string;
  pattern: string;
  maxOccurrences: number | null;
  name: string;
}): RecurrenceIssue {
  const { workspaceSlug, projectId, pattern, maxOccurrences, name } = opts;
  const maxOccurrencesExpr = maxOccurrences === null ? "None" : String(maxOccurrences);

  const script = `
import uuid
from datetime import date, timedelta, timezone as tz
from plane.db.models.workspace import Workspace
from plane.db.models.project import Project
from plane.db.models.issue import Issue
from plane.db.models.state import State
from plane.db.models.user import User
from plane.utils.issue_recurrence import compute_issue_recurrence_next_run_at

workspace = Workspace.objects.get(slug="${workspaceSlug}")
project = Project.objects.get(id="${projectId}")
user = User.objects.filter(is_active=True).order_by("created_at").first()
state = (
    State.all_state_objects.filter(project=project, default=True, deleted_at__isnull=True).first()
    or State.all_state_objects.filter(project=project, deleted_at__isnull=True).first()
)

due_date = date.today() + timedelta(days=1)

issue = Issue.objects.create(
    workspace=workspace,
    project=project,
    name="${name}",
    state=state,
    target_date=due_date,
    recurrence_pattern="${pattern}",
    recurrence_max_occurrences=${maxOccurrencesExpr},
    recurrence_generated_count=0,
    priority="none",
    created_by=user,
    updated_by=user,
)

next_run = compute_issue_recurrence_next_run_at(
    project_id=issue.project_id,
    target_date=issue.target_date,
    recurrence_pattern=issue.recurrence_pattern,
    recurrence_max_occurrences=issue.recurrence_max_occurrences,
    recurrence_generated_count=issue.recurrence_generated_count,
)
if next_run:
    issue.recurrence_next_run_at = next_run
    issue.save(update_fields=["recurrence_next_run_at"])

print(f"ISSUE_RESULT:{workspace.slug}|{project.id}|{issue.id}|{issue.sequence_id}")
`;

  const output = runDjangoShell(script);
  const match = output.match(/ISSUE_RESULT:([^\n\r]+)/);
  if (!match?.[1]) throw new Error(`Unable to parse issue creation output: ${output}`);
  const parts = match[1].trim().split("|");
  if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts[3]) {
    throw new Error(`Incomplete issue identifiers: ${match[1]}`);
  }
  return {
    workspaceSlug: parts[0],
    projectId: parts[1],
    id: parts[2],
    sequenceId: Number(parts[3]),
  };
}

function countGeneratedDuplicates(projectId: string, sourceIssueId: string): number {
  const script = `
from plane.db.models.issue import Issue
count = Issue.issue_objects.filter(
    project_id="${projectId}",
    recurrence_source_issue_id="${sourceIssueId}",
).count()
print(f"COUNT:{count}")
`;
  const output = runDjangoShell(script);
  const match = output.match(/COUNT:(\d+)/);
  if (!match?.[1]) throw new Error(`Unable to parse duplicate count: ${output}`);
  return Number(match[1]);
}

function overrideNextRunToNow(issueId: string): void {
  const script = `
from plane.db.models.issue import Issue
from django.utils import timezone

issue = Issue.objects.get(id="${issueId}")
issue.recurrence_next_run_at = timezone.now()
issue.save(update_fields=["recurrence_next_run_at"])
print("OVERRIDE_OK")
`;
  const output = runDjangoShell(script);
  if (!output.includes("OVERRIDE_OK")) throw new Error(`Override next_run_at failed: ${output}`);
}

function triggerRecurrenceTask(): void {
  const script = `
from plane.bgtasks.issue_recurrence_task import process_recurring_issues
process_recurring_issues()
print("TASK_OK")
`;
  const output = runDjangoShell(script);
  if (!output.includes("TASK_OK")) throw new Error(`Recurrence task invocation failed: ${output}`);
}

function getGeneratedCount(issueId: string): number {
  const script = `
from plane.db.models.issue import Issue
issue = Issue.objects.get(id="${issueId}")
print(f"GEN_COUNT:{issue.recurrence_generated_count}")
`;
  const output = runDjangoShell(script);
  const match = output.match(/GEN_COUNT:(\d+)/);
  if (!match?.[1]) throw new Error(`Unable to parse generated count: ${output}`);
  return Number(match[1]);
}

function getRecurrencePattern(issueId: string): string {
  const script = `
from plane.db.models.issue import Issue
issue = Issue.objects.get(id="${issueId}")
print(f"PATTERN:{issue.recurrence_pattern or 'null'}")
`;
  const output = runDjangoShell(script);
  const match = output.match(/PATTERN:([^\n\r]+)/);
  if (!match?.[1]) throw new Error(`Unable to parse recurrence pattern: ${output}`);
  return match[1].trim();
}

function getFirstDuplicateId(projectId: string, sourceIssueId: string): string | undefined {
  const script = `
from plane.db.models.issue import Issue
dup = Issue.issue_objects.filter(
    project_id="${projectId}",
    recurrence_source_issue_id="${sourceIssueId}",
).first()
if dup:
    print(f"DUP_ID:{dup.id}")
else:
    print("DUP_ID:none")
`;
  const output = runDjangoShell(script);
  const match = output.match(/DUP_ID:([^\n\r]+)/);
  if (!match?.[1]) throw new Error(`Unable to parse duplicate id: ${output}`);
  const val = match[1].trim();
  return val === "none" ? undefined : val;
}

// ---------------------------------------------------------------------------
// Shared state for serial tests
// ---------------------------------------------------------------------------
let workspaceSlug = "";
let projectId = "";
let baseIssueId = "";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
test.describe.serial("Recurring Work Item E2E", () => {
  test.beforeAll(() => {
    const seeded = ensureE2ESeedData();
    workspaceSlug = seeded.workspaceSlug;
    projectId = seeded.projectId;
    baseIssueId = seeded.issueId;
  });

  // -------------------------------------------------------------------------
  // Test 1: Configure recurrence on a work item via the API
  // -------------------------------------------------------------------------
  test("1. Configure recurrence pattern and max repetitions on a work item", async ({ page }) => {
    await signInViaApi(page);
    await page.goto(BASE_URL);
    await waitForPageLoad(page);

    const resolvedSlug = workspaceSlug || (await signInAndEnsureWorkspace(page));
    expect(resolvedSlug.length).toBeGreaterThan(0);

    const setDueDateResponse = await page.request.patch(
      `${BASE_URL}/api/workspaces/${resolvedSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { target_date: farFutureDateIso() },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(setDueDateResponse.ok()).toBe(true);

    const patchResponse = await page.request.patch(
      `${BASE_URL}/api/workspaces/${resolvedSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: {
          recurrence_pattern: "weekly",
          recurrence_max_occurrences: 3,
        },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(patchResponse.ok()).toBe(true);

    const getResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${resolvedSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      { headers: { "Content-Type": "application/json" } }
    );
    expect(getResponse.ok()).toBe(true);
    const issueData = (await getResponse.json()) as Record<string, unknown>;
    expect(issueData["recurrence_pattern"]).toBe("weekly");
    expect(issueData["recurrence_max_occurrences"]).toBe(3);
    expect(typeof issueData["recurrence_next_run_at"]).toBe("string");
    expect((issueData["recurrence_next_run_at"] as string).length).toBeGreaterThan(0);
    expect(issueData["recurrence_source_issue_id"] ?? null).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 2: Clearing the due date removes recurrence settings
  // -------------------------------------------------------------------------
  test("2. Clearing the due date also clears the recurrence pattern", async ({ page }) => {
    await signInViaApi(page);

    await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { target_date: farFutureDateIso(), recurrence_pattern: "monthly" },
        headers: { "Content-Type": "application/json" },
      }
    );

    const clearResponse = await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: {
          target_date: null,
          recurrence_pattern: null,
          recurrence_max_occurrences: null,
        },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(clearResponse.ok()).toBe(true);

    const getAfterClearResponse = await page.request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      { headers: { "Content-Type": "application/json" } }
    );
    expect(getAfterClearResponse.ok()).toBe(true);
    const data = (await getAfterClearResponse.json()) as Record<string, unknown>;
    expect(data["target_date"] ?? null).toBeNull();
    expect(data["recurrence_pattern"] ?? null).toBeNull();
    expect(data["recurrence_max_occurrences"] ?? null).toBeNull();
    expect(data["recurrence_next_run_at"] ?? null).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 3: API rejects recurrence pattern when due date is absent
  // -------------------------------------------------------------------------
  test("3. Setting recurrence pattern without a due date is rejected", async ({ page }) => {
    await signInViaApi(page);

    await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { target_date: null, recurrence_pattern: null },
        headers: { "Content-Type": "application/json" },
      }
    );

    const badResponse = await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { recurrence_pattern: "daily" },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(badResponse.status()).toBeGreaterThanOrEqual(400);
    expect(badResponse.status()).toBeLessThan(500);
  });

  // -------------------------------------------------------------------------
  // Test 4: API rejects non-positive max_occurrences
  // -------------------------------------------------------------------------
  test("4. Setting max_occurrences to 0 is rejected by the API", async ({ page }) => {
    await signInViaApi(page);

    await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { target_date: farFutureDateIso() },
        headers: { "Content-Type": "application/json" },
      }
    );

    const badResponse = await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { recurrence_pattern: "daily", recurrence_max_occurrences: 0 },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(badResponse.status()).toBeGreaterThanOrEqual(400);
    expect(badResponse.status()).toBeLessThan(500);
  });

  // -------------------------------------------------------------------------
  // Test 5: Duplicate creation via background task (short test interval)
  // -------------------------------------------------------------------------
  test("5. Background task creates a duplicate for a due recurring source", async () => {
    const sourceIssue = createRecurringIssueViaShell({
      workspaceSlug,
      projectId,
      pattern: "every_minute",
      maxOccurrences: null,
      name: "E2E recurring source - every_minute",
    });

    overrideNextRunToNow(sourceIssue.id);
    triggerRecurrenceTask();

    const duplicateCount = countGeneratedDuplicates(projectId, sourceIssue.id);
    expect(duplicateCount).toBe(1);

    const generatedCount = getGeneratedCount(sourceIssue.id);
    expect(generatedCount).toBe(1);

    const pattern = getRecurrencePattern(sourceIssue.id);
    expect(pattern).toBe("every_minute");
  });

  // -------------------------------------------------------------------------
  // Test 6: Generated duplicate does not inherit recurrence settings
  // -------------------------------------------------------------------------
  test("6. Generated duplicate has no recurrence configuration", async ({ page }) => {
    await signInViaApi(page);

    const sourceIssue = createRecurringIssueViaShell({
      workspaceSlug,
      projectId,
      pattern: "every_minute",
      maxOccurrences: null,
      name: "E2E duplicate inheritance check",
    });
    overrideNextRunToNow(sourceIssue.id);
    triggerRecurrenceTask();

    const duplicateId = getFirstDuplicateId(projectId, sourceIssue.id);
    expect(duplicateId).toBeDefined();

    if (duplicateId) {
      const dupResponse = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${duplicateId}/`
      );
      expect(dupResponse.ok()).toBe(true);
      const duplicate = (await dupResponse.json()) as Record<string, unknown>;
      expect(duplicate["recurrence_pattern"] ?? null).toBeNull();
      expect(duplicate["start_date"] ?? null).toBeNull();
      expect(duplicate["recurrence_source_issue_id"]).toBe(sourceIssue.id);
      expect(duplicate["recurrence_generated_count"]).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Test 7: Max repetition exhaustion stops further duplicate creation
  // -------------------------------------------------------------------------
  test("7. Recurrence stops creating duplicates after max_occurrences is reached", async () => {
    const maxOccurrences = 2;

    const sourceIssue = createRecurringIssueViaShell({
      workspaceSlug,
      projectId,
      pattern: "every_minute",
      maxOccurrences,
      name: "E2E exhaustion check - max 2",
    });

    for (let i = 0; i < maxOccurrences; i++) {
      overrideNextRunToNow(sourceIssue.id);
      triggerRecurrenceTask();
    }

    const countAfterExhaustion = countGeneratedDuplicates(projectId, sourceIssue.id);
    expect(countAfterExhaustion).toBe(maxOccurrences);

    const generatedCount = getGeneratedCount(sourceIssue.id);
    expect(generatedCount).toBe(maxOccurrences);

    overrideNextRunToNow(sourceIssue.id);
    triggerRecurrenceTask();

    const countAfterExtra = countGeneratedDuplicates(projectId, sourceIssue.id);
    expect(countAfterExtra).toBe(maxOccurrences);
  });

  // -------------------------------------------------------------------------
  // Test 8: Recurrence pattern is cleared on source when max reached
  // -------------------------------------------------------------------------
  test("8. Recurrence pattern is cleared on source issue when max_occurrences is exhausted", async () => {
    const sourceIssue = createRecurringIssueViaShell({
      workspaceSlug,
      projectId,
      pattern: "every_minute",
      maxOccurrences: 1,
      name: "E2E pattern clear on exhaustion",
    });

    overrideNextRunToNow(sourceIssue.id);
    triggerRecurrenceTask();

    const pattern = getRecurrencePattern(sourceIssue.id);
    expect(pattern).toBe("null");
  });

  // -------------------------------------------------------------------------
  // Test 9: "once" cadence - fires once then clears
  // -------------------------------------------------------------------------
  test("9. 'once' cadence fires once and then the pattern is cleared", async () => {
    const sourceIssue = createRecurringIssueViaShell({
      workspaceSlug,
      projectId,
      pattern: "once",
      maxOccurrences: null,
      name: "E2E once cadence test",
    });

    overrideNextRunToNow(sourceIssue.id);
    triggerRecurrenceTask();

    const duplicateCount = countGeneratedDuplicates(projectId, sourceIssue.id);
    expect(duplicateCount).toBe(1);

    const pattern = getRecurrencePattern(sourceIssue.id);
    expect(pattern).toBe("null");
  });

  // -------------------------------------------------------------------------
  // Test 10: Idempotency - running the task twice without advancing next_run_at
  // -------------------------------------------------------------------------
  test("10. Running the task twice without advancing next_run_at is idempotent", async () => {
    const sourceIssue = createRecurringIssueViaShell({
      workspaceSlug,
      projectId,
      pattern: "every_minute",
      maxOccurrences: null,
      name: "E2E idempotency check",
    });

    overrideNextRunToNow(sourceIssue.id);
    triggerRecurrenceTask(); // first run - creates one duplicate and advances next_run_at

    // Do NOT call overrideNextRunToNow again - next_run_at is now in the future
    triggerRecurrenceTask(); // second run - should be skipped

    const duplicateCount = countGeneratedDuplicates(projectId, sourceIssue.id);
    expect(duplicateCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 11: UI smoke - work item detail page shows Repeat and Max repetitions
  // -------------------------------------------------------------------------
  test("11. Work item detail sidebar shows Repeat and Max repetitions fields", async ({ page }) => {
    await signInViaApi(page);

    await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { target_date: farFutureDateIso(), recurrence_pattern: null },
        headers: { "Content-Type": "application/json" },
      }
    );

    const detailUrl = `${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`;
    await page.goto(detailUrl);
    await waitForPageLoad(page);

    const repeatLabel = page.locator("text=Repeat").first();
    await expect(repeatLabel).toBeVisible({ timeout: 15_000 });

    const maxRepLabel = page.locator("text=Max repetitions").first();
    await expect(maxRepLabel).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // Test 12: UI smoke - "Set a due date first." hint shown when no due date
  // -------------------------------------------------------------------------
  test("12. Repeat helper shows 'Set a due date first.' when no due date", async ({ page }) => {
    await signInViaApi(page);

    await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: { target_date: null, recurrence_pattern: null, recurrence_max_occurrences: null },
        headers: { "Content-Type": "application/json" },
      }
    );

    const detailUrl = `${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`;
    await page.goto(detailUrl);
    await waitForPageLoad(page);

    const helperText = page.locator("text=Set a due date first.").first();
    await expect(helperText).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // Test 13: UI smoke - "Infinite by default." hint when cadence set, max blank
  // -------------------------------------------------------------------------
  test("13. Repeat helper shows 'Infinite by default.' when cadence is set and max left blank", async ({ page }) => {
    await signInViaApi(page);

    await page.request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`,
      {
        data: {
          target_date: farFutureDateIso(),
          recurrence_pattern: "weekly",
          recurrence_max_occurrences: null,
        },
        headers: { "Content-Type": "application/json" },
      }
    );

    const detailUrl = `${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${baseIssueId}/`;
    await page.goto(detailUrl);
    await waitForPageLoad(page);

    const infiniteHint = page.locator("text=Infinite by default.").first();
    await expect(infiniteHint).toBeVisible({ timeout: 15_000 });
  });
});
