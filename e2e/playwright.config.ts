import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = process.env.E2E_WEB_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const API_BASE_URL = process.env.E2E_API_URL ?? process.env.E2E_API_BASE_URL ?? WEB_BASE_URL;
const COMPOSE_PROJECT = process.env.E2E_COMPOSE_PROJECT ?? (process.env.CI ? "" : "wrrw-e2e");

// Keep legacy helpers (time-tracking.ts) aligned with this config.
process.env.PLAYWRIGHT_BASE_URL = WEB_BASE_URL;
process.env.BASE_URL = WEB_BASE_URL;
process.env.E2E_API_BASE_URL = API_BASE_URL;
process.env.E2E_COMPOSE_PROJECT = COMPOSE_PROJECT;
process.env.E2E_TOTP_SECRET = process.env.E2E_TOTP_SECRET ?? "JBSWY3DPEHPK3PXP";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: WEB_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      Accept: "text/html,application/json",
    },
  },
  globalSetup: "./global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  metadata: {
    apiBaseUrl: API_BASE_URL,
  },
});
