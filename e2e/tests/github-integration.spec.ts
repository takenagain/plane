/**
 * E2E Tests for GitHub Integration (Goal 2)
 *
 * Coverage:
 * 1. Admin navigates to workspace Settings → Integrations.
 * 2. GitHub integration card renders with Install when sync is enabled.
 * 3. Authenticated GET /api/integrations/ and workspace-integrations return 200.
 * 4. GitHub webhook endpoint validates HMAC and accepts ping events.
 *
 * Skipped (require real GitHub App / OAuth):
 * - Completing GitHub App installation callback.
 * - Listing repositories and linking a repo to a project.
 *
 * Prerequisites:
 * - Plane at http://localhost:8081 (or BASE_URL / PLAYWRIGHT_BASE_URL).
 * - API container reachable for ensureGithubE2EConfig (docker/podman).
 */

import { test, expect } from "@playwright/test";
import { ensureE2ESeedData, signInAndEnsureWorkspace, waitForPageLoad, BASE_URL } from "./helpers/time-tracking";
import {
  E2E_GITHUB_APP_NAME,
  E2E_GITHUB_WEBHOOK_SECRET,
  authenticatedApiSession,
  ensureGithubE2EConfig,
  fetchIntegrationsCatalog,
  fetchWorkspaceIntegrations,
  githubIntegrationCard,
  navigateToWorkspaceIntegrations,
  postGithubWebhook,
} from "./helpers/github-integration";

let workspaceSlug: string;

test.beforeAll(() => {
  ensureGithubE2EConfig();
  const seed = ensureE2ESeedData();
  workspaceSlug = seed.workspaceSlug;
});

test.describe.serial("GitHub integration — workspace settings", () => {
  test.beforeEach(async ({ page }) => {
    await test.step("Sign in as workspace admin", async () => {
      const slug = await signInAndEnsureWorkspace(page);
      workspaceSlug = slug || workspaceSlug;
    });
  });

  test("integrations settings page loads for admin", async ({ page }) => {
    await test.step("Open workspace integrations settings", async () => {
      await navigateToWorkspaceIntegrations(page, workspaceSlug);
    });

    await test.step("Verify URL and page chrome", async () => {
      await expect(page).toHaveURL(new RegExp(`/${workspaceSlug}/settings/integrations/?`));
      await expect(page.getByRole("heading", { name: "Integrations", level: 3 })).toBeVisible();
    });
  });

  test("GitHub card shows connect copy and Install button when not connected", async ({ page }) => {
    await test.step("Navigate to integrations", async () => {
      await navigateToWorkspaceIntegrations(page, workspaceSlug);
    });

    const card = githubIntegrationCard(page);

    await test.step("Verify GitHub integration card", async () => {
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByRole("heading", { name: "GitHub" })).toBeVisible();
      await expect(card.getByText(/Connect with GitHub/i)).toBeVisible();
      const installButton = card.getByRole("button", { name: /^Install$/ });
      await expect(installButton).toBeVisible();
      await expect(installButton).toBeEnabled();
    });
  });

  test("Install opens GitHub App install URL in a popup", async ({ page }) => {
    await test.step("Navigate to integrations", async () => {
      await navigateToWorkspaceIntegrations(page, workspaceSlug);
    });

    const card = githubIntegrationCard(page);
    const installButton = card.getByRole("button", { name: /^Install$/ });
    await expect(installButton).toBeVisible();

    await test.step("Click Install and assert popup targets GitHub App", async () => {
      const [popup] = await Promise.all([page.waitForEvent("popup"), installButton.click()]);
      await expect(popup).toHaveURL(new RegExp(`github\\.com/apps/${E2E_GITHUB_APP_NAME}/installations/new`));
      await popup.close();
    });
  });
});

test.describe.serial("GitHub integration — API", () => {
  test.beforeEach(async ({ page }) => {
    await test.step("Authenticate via API session", async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await authenticatedApiSession(page);
    });
  });

  test("GET /api/integrations/ includes GitHub catalog entry", async ({ page }) => {
    let catalog: Array<{ provider?: string; title?: string }> = [];

    await test.step("Fetch integrations catalog", async () => {
      catalog = await fetchIntegrationsCatalog(page.request);
    });

    await test.step("Assert GitHub provider is listed", async () => {
      const github = catalog.find((item) => item.provider === "github");
      expect(github).toBeDefined();
      expect(github?.title).toMatch(/GitHub/i);
    });
  });

  test("GET workspace-integrations returns 200 for admin workspace", async ({ page }) => {
    let list: unknown[] = [];

    await test.step("Fetch workspace integrations", async () => {
      list = await fetchWorkspaceIntegrations(page.request, workspaceSlug);
    });

    await test.step("Assert list shape", async () => {
      expect(Array.isArray(list)).toBe(true);
    });
  });

  test("GitHub webhook rejects invalid signature", async ({ page }) => {
    let status = 0;

    await test.step("POST webhook with bad signature", async () => {
      const result = await postGithubWebhook(
        page.request,
        { zen: "plane-e2e" },
        {
          secret: "wrong-secret",
          event: "ping",
        }
      );
      status = result.status;
    });

    expect(status).toBe(403);
  });

  test("GitHub webhook accepts signed ping event", async ({ page }) => {
    let status = 0;
    let body: unknown;

    await test.step("POST signed ping payload", async () => {
      const result = await postGithubWebhook(
        page.request,
        { zen: "plane-e2e", hook_id: 1 },
        { secret: E2E_GITHUB_WEBHOOK_SECRET, event: "ping" }
      );
      status = result.status;
      body = result.body;
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok" });
  });
});

test.describe("GitHub integration — external GitHub (skipped)", () => {
  test.skip(
    true,
    "Requires a live GitHub App installation and OAuth callback; not feasible in local E2E without secrets."
  );

  test("complete GitHub App install and see connected state", async () => {
    // Manual / staging-only: install app, POST installation_id to workspace-integrations/github/.
  });

  test.skip(true, "Requires installation token and repository list from github.com API.");

  test("link a GitHub repository to a Plane project", async () => {
    // Manual / staging-only: project settings → integrations → select repository.
  });
});
