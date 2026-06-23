import { expect, type Page } from "@playwright/test";
import { BASE_URL, waitForPageLoad } from "./time-tracking";

export function wikiListUrl(workspaceSlug: string) {
  return `${BASE_URL}/${workspaceSlug}/wiki`;
}

export function wikiPageUrl(workspaceSlug: string, pageId: string) {
  return `${BASE_URL}/${workspaceSlug}/wiki/${pageId}`;
}

export function projectPagesUrl(workspaceSlug: string, projectId: string) {
  return `${BASE_URL}/${workspaceSlug}/projects/${projectId}/pages`;
}

/** App switcher Wiki tab (scoped by href to avoid duplicate Wiki links). */
export function wikiAppSwitcherLink(page: Page, workspaceSlug: string) {
  return page.locator(`a[href="/${workspaceSlug}/wiki"], a[href="/${workspaceSlug}/wiki/"]`).first();
}

/** Navigate to wiki list via the workspace app switcher (Projects ↔ Wiki). */
export async function navigateToWikiViaAppSwitcher(page: Page, workspaceSlug: string) {
  await page.goto(`${BASE_URL}/${workspaceSlug}/`);
  await waitForPageLoad(page);
  const wikiTab = wikiAppSwitcherLink(page, workspaceSlug);
  await expect(wikiTab).toBeVisible({ timeout: 30_000 });
  await wikiTab.click();
  await waitForPageLoad(page);
  await expect(page).toHaveURL(new RegExp(`/${workspaceSlug}/wiki`));
}

/** Open wiki list by direct URL. */
export async function navigateToWikiDirect(page: Page, workspaceSlug: string) {
  await page.goto(wikiListUrl(workspaceSlug));
  await waitForPageLoad(page);
  await expect(page).toHaveURL(new RegExp(`/${workspaceSlug}/wiki`));
}

export async function createWikiPageViaApi(
  page: Page,
  workspaceSlug: string,
  payload: { name?: string; access?: number } = {}
): Promise<{ id: string; name: string }> {
  const response = await page.request.post(`${BASE_URL}/api/workspaces/${workspaceSlug}/wiki-pages/`, {
    data: {
      access: payload.access ?? 0,
      ...(payload.name ? { name: payload.name } : {}),
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string; name?: string };
  expect(body.id).toBeTruthy();
  return { id: body.id, name: payload.name ?? body.name ?? "" };
}

export async function updateWikiPageViaApi(
  page: Page,
  workspaceSlug: string,
  pageId: string,
  payload: { name?: string; description_html?: string }
) {
  const response = await page.request.patch(`${BASE_URL}/api/workspaces/${workspaceSlug}/wiki-pages/${pageId}/`, {
    data: payload,
  });
  expect(response.ok()).toBeTruthy();
}

/** Click "Add page" on wiki list (UI create) and return the new page id. */
export async function createWikiPageFromListUi(page: Page): Promise<string> {
  const addPageButton = page.getByRole("button", { name: /^Add page$/i });
  const emptyStateButton = page.getByRole("button", { name: /add page|create page/i }).first();

  if (await addPageButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await addPageButton.click();
  } else {
    await expect(emptyStateButton).toBeVisible({ timeout: 15_000 });
    await emptyStateButton.click();
  }

  await page.waitForURL(/\/wiki\/[a-f0-9-]+/i, { timeout: 30_000 });
  const match = page.url().match(/\/wiki\/([a-f0-9-]+)/i);
  if (!match?.[1]) {
    throw new Error(`Wiki page was not created; current URL: ${page.url()}`);
  }
  return match[1];
}

/** Page title input on wiki detail (collaborative editor title). */
export function wikiPageTitleInput(page: Page) {
  return page
    .getByPlaceholder("Untitled")
    .or(page.locator("[data-node-type='title-block']"))
    .or(page.locator(".ProseMirror").first());
}

/** Main wiki body editor (ProseMirror). */
export function wikiPageBodyEditor(page: Page) {
  return page.locator(".ProseMirror[contenteditable='true']").last();
}

export async function waitForWikiPageEditor(page: Page) {
  const bodyEditor = wikiPageBodyEditor(page);
  await expect(bodyEditor).toBeVisible({ timeout: 30_000 });
  return { titleInput: wikiPageTitleInput(page), bodyEditor };
}

export async function archiveWikiPageViaApi(page: Page, workspaceSlug: string, pageId: string) {
  const response = await page.request.post(`${BASE_URL}/api/workspaces/${workspaceSlug}/wiki-pages/${pageId}/archive/`);
  expect(response.ok()).toBeTruthy();
}

export async function deleteWikiPageViaApi(page: Page, workspaceSlug: string, pageId: string) {
  const response = await page.request.delete(`${BASE_URL}/api/workspaces/${workspaceSlug}/wiki-pages/${pageId}/`);
  expect(response.ok()).toBeTruthy();
}

/** Assert a page title does not appear on the project-scoped Pages list. */
export async function expectPageAbsentFromProjectPages(
  page: Page,
  workspaceSlug: string,
  projectId: string,
  pageTitle: string
) {
  await page.goto(projectPagesUrl(workspaceSlug, projectId));
  await waitForPageLoad(page);
  await expect(page.getByText(pageTitle, { exact: true })).toHaveCount(0);
}

export async function expectWikiPageOnList(page: Page, pageTitle: string) {
  await expect(page.getByRole("link", { name: pageTitle }).first()).toBeVisible({ timeout: 15_000 });
}
