/**
 * Shared helpers for cycle automation E2E specs.
 */

import { execFileSync } from "node:child_process";
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { BASE_URL, resolveApiContainerName, signInAndEnsureWorkspace, waitForPageLoad } from "./time-tracking";

export { BASE_URL };

/** Get the toggle switch (role="switch") for a given automation heading. */
export function automationToggle(page: Page, title: string): Locator {
  return page.locator(`h4:text-is("${title}")`).locator("xpath=../..").getByRole("switch");
}

/** Click a toggle and wait for the project-settings PATCH to round-trip. */
export async function clickToggleAndWait(page: Page, toggle: Locator): Promise<void> {
  const responsePromise = page.waitForResponse(
    (resp) => resp.request().method() === "PATCH" && resp.url().includes("/projects/") && resp.ok(),
    { timeout: 30_000 }
  );
  await toggle.click();
  await responsePromise;
}

export function automationsPath(workspaceSlug: string, projectId: string): string {
  return `${BASE_URL}/${workspaceSlug}/settings/projects/${projectId}/automations/`;
}

export function cyclesPath(workspaceSlug: string, projectId: string): string {
  return `${BASE_URL}/${workspaceSlug}/projects/${projectId}/cycles/`;
}

export async function navigateToAutomations(page: Page, workspaceSlug: string, projectId: string): Promise<void> {
  const heading = page.locator("h4:text-is('Auto-create cycles')");
  await page.goto(automationsPath(workspaceSlug, projectId));
  await waitForPageLoad(page);
  if (!(await heading.isVisible({ timeout: 5_000 }).catch(() => false))) {
    await signInAndEnsureWorkspace(page);
    await page.goto(automationsPath(workspaceSlug, projectId));
    await waitForPageLoad(page);
  }
  await expect(heading).toBeVisible({ timeout: 30_000 });
}

export async function navigateToCycles(page: Page, workspaceSlug: string, projectId: string): Promise<void> {
  await page.goto(cyclesPath(workspaceSlug, projectId));
  await waitForPageLoad(page);
}

export async function enableBothAutomationToggles(page: Page): Promise<void> {
  const createToggle = automationToggle(page, "Auto-create cycles");
  if ((await createToggle.getAttribute("aria-checked")) !== "true") {
    await clickToggleAndWait(page, createToggle);
    await expect(createToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
  }

  const transferToggle = automationToggle(page, "Auto-transfer work items");
  await expect(transferToggle).toBeEnabled({ timeout: 10_000 });
  if ((await transferToggle.getAttribute("aria-checked")) !== "true") {
    await clickToggleAndWait(page, transferToggle);
    await expect(transferToggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
  }
}

export async function resetAutomationTogglesToOff(page: Page): Promise<void> {
  const createToggle = automationToggle(page, "Auto-create cycles");
  if ((await createToggle.getAttribute("aria-checked")) === "true") {
    await clickToggleAndWait(page, createToggle);
    await expect(createToggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
  }
}

export function runDjangoShell(script: string): string {
  const { runtime, container } = resolveApiContainerName();

  return execFileSync(runtime, ["exec", "-w", "/", container, "python", "/code/manage.py", "shell", "-c", script], {
    encoding: "utf-8",
    cwd: "/",
  });
}

/** Enable the Cycles module on the seed project (off by default in schema). */
export function ensureProjectCyclesEnabled(projectId: string): void {
  runDjangoShell(`
from plane.db.models import Project
Project.objects.filter(id="${projectId}").update(cycle_view=True)
print("OK")
`);
}

/** Reset automation flags and remove test cycles/issues created by shell helpers. */
export function resetCycleAutomationBackend(projectId: string): void {
  runDjangoShell(`
from plane.db.models import Cycle, CycleIssue, Issue, Project

project_id = "${projectId}"
Project.objects.filter(id=project_id).update(
    auto_create_cycles=False,
    auto_transfer_cycle_issues=False,
)
Issue.issue_objects.filter(project_id=project_id, name__startswith="E2E transfer issue").delete()
CycleIssue.objects.filter(project_id=project_id).delete()
Cycle.objects.filter(project_id=project_id).delete()
print("OK")
`);
}

export interface CycleAutomationSeedResult {
  endedCycleId: string;
  issueId: string;
}

/**
 * Create an ended cycle (within 24h window) with one incomplete issue for background-task tests.
 * Does not enable project toggles — caller should set those via UI or shell.
 */
export function seedEndedCycleWithIncompleteIssue(projectId: string): CycleAutomationSeedResult {
  const output = runDjangoShell(`
from datetime import timedelta
from django.utils import timezone
from plane.db.models import Cycle, CycleIssue, Issue, Project, State, User

project = Project.objects.get(id="${projectId}")
user = project.created_by or project.workspace.owner
now = timezone.now()

ended = Cycle.objects.create(
    name="E2E Sprint ended",
    project=project,
    workspace=project.workspace,
    start_date=now - timedelta(days=15),
    end_date=now - timedelta(hours=2),
    owned_by=user,
    created_by=user,
    updated_by=user,
)

backlog = State.objects.filter(project=project, group="backlog", deleted_at__isnull=True).first()
if backlog is None:
    backlog = State.objects.filter(project=project, deleted_at__isnull=True).first()

issue = Issue.objects.create(
    name="E2E transfer issue",
    project=project,
    workspace=project.workspace,
    state=backlog,
    created_by=user,
    updated_by=user,
)
CycleIssue.objects.create(
    cycle=ended,
    issue=issue,
    project=project,
    workspace=project.workspace,
    created_by=user,
    updated_by=user,
)
print(f"ENDED_CYCLE:{ended.id}")
print(f"ISSUE:{issue.id}")
`);

  const endedMatch = output.match(/ENDED_CYCLE:([^\s]+)/);
  const issueMatch = output.match(/ISSUE:([^\s]+)/);
  if (!endedMatch?.[1] || !issueMatch?.[1]) {
    throw new Error(`Failed to seed cycle automation data: ${output}`);
  }
  return { endedCycleId: endedMatch[1], issueId: issueMatch[1] };
}

export function setProjectAutomationFlags(
  projectId: string,
  flags: { auto_create_cycles: boolean; auto_transfer_cycle_issues: boolean }
): void {
  runDjangoShell(`
from plane.db.models import Project
Project.objects.filter(id="${projectId}").update(
    auto_create_cycles=${flags.auto_create_cycles ? "True" : "False"},
    auto_transfer_cycle_issues=${flags.auto_transfer_cycle_issues ? "True" : "False"},
)
print("OK")
`);
}

export function invokeProcessCycleAutomations(): void {
  runDjangoShell(`
from plane.bgtasks.cycle_automation_task import process_cycle_automations
process_cycle_automations()
print("OK")
`);
}

export function getIssueCycleId(issueId: string): string {
  const output = runDjangoShell(`
from plane.db.models import CycleIssue
ci = CycleIssue.objects.filter(issue_id="${issueId}").first()
if ci is None:
    print("CYCLE_ID:none")
else:
    print(f"CYCLE_ID:{ci.cycle_id}")
`);
  const match = output.match(/CYCLE_ID:([^\s]+)/);
  if (!match?.[1]) throw new Error(`Unable to parse issue cycle: ${output}`);
  if (match[1] === "none") throw new Error(`Issue ${issueId} is not in any cycle`);
  return match[1];
}

export function countProjectCycles(projectId: string): number {
  const output = runDjangoShell(`
from plane.db.models import Cycle
print(f"COUNT:{Cycle.objects.filter(project_id="${projectId}").count()}")
`);
  const match = output.match(/COUNT:(\d+)/);
  if (!match?.[1]) throw new Error(`Unable to parse cycle count: ${output}`);
  return Number(match[1]);
}
