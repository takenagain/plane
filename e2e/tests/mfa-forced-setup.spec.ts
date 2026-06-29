import { expect, test, type Page } from "@playwright/test";
import { authenticator } from "otplib";

const API_BASE_URL = process.env.E2E_API_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003";
const TEST_PASSWORD = "E2e-Test-Password-123!";

async function enrollTotpOnSetupPage(page: Page) {
  await expect(
    page.getByRole("heading", { name: /set up two-factor authentication|secure your account/i })
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: /authenticator app/i }).click();
  await expect(page.locator("#totp-code")).toBeVisible({ timeout: 30_000 });
  await page.locator("summary").click();
  const secretLocator = page.locator("code.font-mono").first();
  await expect(secretLocator).toBeVisible();
  const secret = (await secretLocator.innerText()).replace(/\s/g, "");
  const code = authenticator.generate(secret);
  await page.locator("#totp-code").fill(code);

  await expect
    .poll(async () => {
      const me = await page.request.get(`${API_BASE_URL}/api/users/me/`);
      if (!me.ok()) return false;
      const body = (await me.json()) as { mfa_setup_required?: boolean; mfa_enabled?: boolean };
      return body.mfa_enabled === true || body.mfa_setup_required === false;
    })
    .toBeTruthy();

  const recoveryHeading = page.getByText(/save your recovery codes/i);
  if (await recoveryHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /saved my codes/i }).click();
  }
  const done = page.getByRole("button", { name: /^done$/i });
  if (await done.isVisible().catch(() => false)) {
    await done.click();
  }
}

async function markUserOnboarded(page: Page) {
  const response = await page.request.patch(`${API_BASE_URL}/api/users/me/profile/`, {
    data: {
      is_onboarded: true,
      onboarding_step: {
        profile_complete: true,
        workspace_create: true,
        workspace_invite: true,
        workspace_join: true,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("Local 2FA — forced setup", () => {
  test("sign-up, onboarding MFA enrollment, and app access", async ({ page }) => {
    const testEmail = `e2e-mfa-${Date.now()}@plane.test`;

    await page.goto("/sign-up/");
    await page.locator("#email").fill(testEmail);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.locator("#confirm-password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL(/\/(onboarding|accounts\/setup-2fa)/, { timeout: 60_000 });

    // Exercise the forced-setup gate (same surface as post-onboarding MFA).
    await page.goto("/accounts/setup-2fa/");
    await enrollTotpOnSetupPage(page);

    const me = await page.request.get(`${API_BASE_URL}/api/users/me/`);
    expect(me.ok()).toBeTruthy();
    const user = await me.json();
    expect(user.mfa_setup_required).toBeFalsy();
  });

  test("existing user without MFA is redirected to forced setup on login", async ({ page }) => {
    const email = `e2e-existing-${Date.now()}@plane.test`;

    const csrf = await page.request.get(`${API_BASE_URL}/auth/get-csrf-token/`);
    const csrfBody = await csrf.json();
    const signUp = await page.request.post(`${API_BASE_URL}/auth/sign-up/`, {
      form: { email, password: TEST_PASSWORD, csrfmiddlewaretoken: csrfBody.csrf_token },
      maxRedirects: 0,
    });
    expect(signUp.status()).toBeLessThan(400);

    await markUserOnboarded(page);

    const signOutCsrf = await page.request.get(`${API_BASE_URL}/auth/get-csrf-token/`);
    const signOutCsrfBody = await signOutCsrf.json();
    await page.request.post(`${API_BASE_URL}/auth/sign-out/`, {
      form: { csrfmiddlewaretoken: signOutCsrfBody.csrf_token },
      headers: { "X-CSRFToken": signOutCsrfBody.csrf_token, Referer: `${API_BASE_URL}/` },
    });

    await page.goto("/sign-in/");
    await page.locator("#email").fill(email);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /go to workspace/i }).click();

    await page.waitForURL(/\/accounts\/setup-2fa/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /set up two-factor authentication/i })).toBeVisible();
  });
});
