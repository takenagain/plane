/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from the system.
 * BASE_URL: The URL of the Plane instance to test against (default: http://localhost:8081)
 * E2E_WEB_SERVER_COMMAND: Optional command to start the app under test.
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:8081";
const E2E_WEB_SERVER_COMMAND = process.env.E2E_WEB_SERVER_COMMAND;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: "html",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(E2E_WEB_SERVER_COMMAND
    ? {
        webServer: {
          command: E2E_WEB_SERVER_COMMAND,
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120 * 1000,
        },
      }
    : {}),
});
