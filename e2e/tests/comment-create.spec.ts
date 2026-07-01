/**
 * E2E: work item comment box accepts input and submits on Enter.
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, ensureE2ESeedData, signInViaApi, waitForPageLoad } from "./helpers/time-tracking";

test("work item comment box accepts typing and Enter submits", async ({ page }) => {
  const { workspaceSlug, projectId, issueId } = ensureE2ESeedData();

  await signInViaApi(page);

  const issueDetailUrl = `${BASE_URL}/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`;
  await page.goto(issueDetailUrl);
  await waitForPageLoad(page);

  const commentEditor = page.locator('[id^="add_comment_"] [contenteditable="true"]').first();
  await commentEditor.scrollIntoViewIfNeeded();
  await expect(commentEditor).toBeVisible({ timeout: 30_000 });

  const commentText = `e2e comment ${Date.now()}`;
  await commentEditor.click();
  await commentEditor.pressSequentially(commentText, { delay: 20 });

  await expect(commentEditor).toContainText(commentText);

  const commentsBefore = await page.request.get(
    `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`
  );
  expect(commentsBefore.ok()).toBeTruthy();
  const beforePayload = (await commentsBefore.json()) as { results?: unknown[] } | unknown[];
  const beforeCount = Array.isArray(beforePayload) ? beforePayload.length : (beforePayload.results?.length ?? 0);

  await commentEditor.press("Enter");

  await expect
    .poll(async () => {
      const response = await page.request.get(
        `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`
      );
      if (!response.ok()) return 0;
      const payload = (await response.json()) as { results?: unknown[] } | unknown[];
      return Array.isArray(payload) ? payload.length : (payload.results?.length ?? 0);
    })
    .toBeGreaterThan(beforeCount);

  await expect(page.getByText(commentText, { exact: false })).toBeVisible({ timeout: 15_000 });
});
