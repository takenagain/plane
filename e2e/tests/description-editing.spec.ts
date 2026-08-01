/**
 * E2E Tests for Work Item Description Editing
 *
 * Coverage:
 * 1. Description field maintains focus while typing continuously.
 * 2. Typed content is preserved (no content loss from debounced saves).
 * 3. Auto-save fires after the debounce interval (~5 s) without losing focus.
 *
 * Prerequisites:
 * - Podman containers running via docker-compose-local.yml / podman-compose.
 * - Plane accessible at BASE_URL (default http://localhost:8081).
 */

import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  signInAndEnsureWorkspace,
  waitForPageLoad,
  BASE_URL,
  WORKSPACE_NAME,
  PROJECT_NAME,
} from "./helpers/time-tracking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let workspaceSlug: string;
let projectId: string;
let freshIssueId: string;

/** Detect whether docker or podman is available. */
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

/** Create a fresh issue via Django management shell. */
function createFreshIssue(): { workspaceSlug: string; projectId: string; issueId: string } {
  const runtime = detectRuntime();
  const containerName = (() => {
    const output = execFileSync(runtime, ["ps", "--format", "{{.Names}}"], { encoding: "utf-8" });
    const names = output
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean);
    return (
      names.find((n) => n === "api") ||
      names.find((n) => n.endsWith("-api-1")) ||
      names.find((n) => n.endsWith("_api_1")) ||
      "api"
    );
  })();

  const script = `
import json, uuid
from plane.db.models.user import User
from plane.db.models.workspace import Workspace
from plane.db.models.project import Project
from plane.db.models.issue import Issue
from plane.db.models.state import State

user = User.objects.get(email="${process.env.E2E_ADMIN_EMAIL || "admin@example.com"}")
import re as _re
workspace_slug = _re.sub(r"[^a-z0-9-]+", "-", "${WORKSPACE_NAME}".lower()).strip("-") or "test-ws"
workspace = Workspace.objects.get(slug=workspace_slug)
project = Project.objects.get(workspace=workspace, name="${PROJECT_NAME}")
default_state = State.all_state_objects.filter(project=project, deleted_at__isnull=True, is_triage=False).order_by("sequence").first()
issue = Issue.objects.create(
    project=project,
    workspace=workspace,
    name="Description editing test " + str(uuid.uuid4())[:8],
    state=default_state,
    priority="none",
    created_by=user,
    updated_by=user,
)
print(f"FRESH_ISSUE:{workspace.slug}|{project.id}|{issue.id}")
`;

  const output = execFileSync(
    runtime,
    ["exec", "-w", "/", containerName, "python", "/code/manage.py", "shell", "-c", script],
    {
      encoding: "utf-8",
      cwd: "/",
    }
  );
  const match = output.match(/FRESH_ISSUE:([^\n\r]+)/);
  if (!match) throw new Error(`Failed to create fresh issue: ${output}`);
  const [ws, proj, issue] = match[1].trim().split("|");
  return { workspaceSlug: ws, projectId: proj, issueId: issue };
}

test.beforeAll(() => {
  const fresh = createFreshIssue();
  workspaceSlug = fresh.workspaceSlug;
  projectId = fresh.projectId;
  freshIssueId = fresh.issueId;
});

/**
 * Return the description ProseMirror editor.  The TipTap EditorContent wrapper
 * div has `id={entityId}` (the issue UUID) and the ProseMirror contenteditable
 * div is its direct child.
 */
function descriptionEditor(page: Page) {
  return page.locator(`[id="${freshIssueId}"] > .ProseMirror[contenteditable='true']`);
}

/** Navigate to the issue detail page and wait for the description editor. */
async function navigateToIssueDetail(page: Page) {
  await page.goto(`${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${freshIssueId}`);
  await waitForPageLoad(page);

  // Dismiss welcome modal
  const dismiss = page.getByRole("button", { name: /no thanks|explore it myself/i });
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click();
    await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Wait for the description editor to appear
  const editor = descriptionEditor(page);
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: navigate to a project issues page and wait for it to load
// ---------------------------------------------------------------------------
async function navigateToProjectIssues(page: Page, ws: string, proj: string) {
  await page.goto(`${BASE_URL}/${ws}/projects/${proj}/issues/`);
  await waitForPageLoad(page);

  // Dismiss welcome modal if present
  const dismiss = page.getByRole("button", { name: /no thanks|explore it myself/i });
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click();
    await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Tests: Create New Issue description editability
// ---------------------------------------------------------------------------

test.describe.serial("Create New Issue – description editor", () => {
  test.beforeEach(async ({ page }) => {
    await signInAndEnsureWorkspace(page);
  });

  test("description field is editable in the Create New Issue modal", async ({ page }) => {
    await navigateToProjectIssues(page, workspaceSlug, projectId);

    const createBtn = page.locator('[data-ph-element="work_items_header_add_work_item_button"]');
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    const descEditor = page.locator("#issue-modal-editor .ProseMirror[contenteditable='true']");
    await expect(descEditor).toBeVisible({ timeout: 30_000 });

    // Verify it is truly editable (not just visible as a skeleton loader)
    const isEditable = await descEditor.getAttribute("contenteditable");
    expect(isEditable).toBe("true");

    // Click and type into the description
    await descEditor.click();
    const testText = "Create modal description test";
    await page.keyboard.type(testText, { delay: 60 });

    // The typed text should appear in the editor
    const content = await descEditor.textContent();
    expect(content).toContain(testText);

    // Close without submitting
    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// Tests: Editing description of an existing work item
// ---------------------------------------------------------------------------

test.describe.serial("Work item description editing", () => {
  test.beforeEach(async ({ page }) => {
    await signInAndEnsureWorkspace(page);
  });

  test("description field keeps focus while typing", async ({ page }) => {
    await navigateToIssueDetail(page);

    const editor = descriptionEditor(page);
    await editor.click();
    await page.waitForTimeout(300);

    const testText = "Focus test sentence";
    await page.keyboard.type(testText, { delay: 80 });
    // The editor (or one of its children) should still be focused
    const isFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? active.closest(".ProseMirror") !== null : false;
    });
    expect(isFocused).toBe(true);

    // Typed content should be present
    const editorContent = await editor.textContent();
    expect(editorContent).toContain(testText);
  });

  test("description field retains focus after debounce save", async ({ page }) => {
    await navigateToIssueDetail(page);

    const editor = descriptionEditor(page);
    await editor.click();
    await page.waitForTimeout(300);

    const testText = "Waiting for debounce";
    await page.keyboard.type(testText, { delay: 50 });

    // Wait longer than the debounce interval (5 s)
    await page.waitForTimeout(7_000);

    // Focus should still be on the editor
    const isFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? active.closest(".ProseMirror") !== null : false;
    });
    expect(isFocused).toBe(true);

    // Content should not be wiped by the save cycle
    const editorContent = await editor.textContent();
    expect(editorContent).toContain(testText);
  });

  test("typed content persists after page reload", async ({ page }) => {
    await navigateToIssueDetail(page);

    const editor = descriptionEditor(page);
    await editor.click();
    await page.waitForTimeout(300);

    // Select all existing content and replace
    await page.keyboard.press("Control+a");
    const uniqueText = `Persist test ${Date.now()}`;
    await page.keyboard.type(uniqueText, { delay: 50 });

    // Wait for debounced save
    await page.waitForTimeout(7_000);

    // Reload and verify content persisted
    await page.reload();
    await waitForPageLoad(page);
    await expect(descriptionEditor(page)).toBeVisible({ timeout: 15_000 });

    const editorContent = await descriptionEditor(page).textContent();
    expect(editorContent).toContain(uniqueText);
  });
});
