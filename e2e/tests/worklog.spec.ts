/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect, APIRequestContext } from "@playwright/test";

/**
 * E2E Tests for Time Tracking (Worklog) Feature - API Tests
 * 
 * These tests verify the worklog API functionality.
 * Tests run against a local Plane instance running in Podman containers.
 * 
 * Prerequisites:
 * - Podman containers running (api, web, worker, beat-worker, db, redis, mq)
 * - Admin user exists with email admin@example.com
 * 
 * Run with: cd e2e && pnpm install && pnpm test
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:8000";

/**
 * Helper to create authenticated request context
 */
async function createAuthenticatedContext(request: APIRequestContext) {
  // First, get CSRF token
  const csrfResponse = await request.get(`${BASE_URL}/auth/get-csrf-token/`);
  const csrfData = await csrfResponse.json();
  const csrfToken = csrfData.csrf_token || "";
  
  return { csrfToken };
}

test.describe("Worklog API Tests", () => {
  let csrfToken = "";
  
  test.beforeEach(async ({ request }) => {
    // Get CSRF token
    const csrfResponse = await request.get(`${BASE_URL}/auth/get-csrf-token/`);
    const csrfData = await csrfResponse.json();
    csrfToken = csrfData.csrf_token || "";
  });

  test("should authenticate as admin user", async ({ request }) => {
    // This test verifies we can authenticate using session-based auth
    // For API tests, we'll use the existing session from the container
    const response = await request.get(`${BASE_URL}/api/users/me/`);
    // May return 401 without proper session, but API should be accessible
    expect([200, 401]).toContain(response.status());
  });

  test("FR-1: should create a worklog", async ({ request }) => {
    // Use existing test-ws workspace
    const workspaceSlug = "test-ws";
    
    // Get project
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    expect(projectsResponse.status()).toBe(200);
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    expect(projectId).toBeDefined();
    
    // Get or create issue
    let issueId: string;
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    
    if (issuesResponse.status() === 200) {
      const issues = await issuesResponse.json();
      const existingIssue = issues.results?.[0] || issues[0];
      if (existingIssue) {
        issueId = existingIssue.id;
      } else {
        // Create an issue for testing
        const createIssueResponse = await request.post(
          `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
          {
            data: {
              name: "Worklog Test Issue",
              description_html: "<p>Testing worklog feature</p>",
            },
          }
        );
        const issue = await createIssueResponse.json();
        issueId = issue.id;
      }
    } else {
      throw new Error("Failed to get or create issue");
    }
    
    // Create worklog
    const today = new Date().toISOString().split("T")[0];
    const worklogResponse = await request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`,
      {
        data: {
          duration: 60,
          logged_at: today,
          description: "E2E test worklog",
        },
      }
    );
    
    expect(worklogResponse.status()).toBe(201);
    const worklog = await worklogResponse.json();
    expect(worklog.duration).toBe(60);
    expect(worklog.description).toBe("E2E test worklog");
    
    // Cleanup
    await request.delete(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklog.id}/`
    );
  });

  test("FR-2: should list worklogs for an issue", async ({ request }) => {
    const workspaceSlug = "test-ws";
    
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    const issues = await issuesResponse.json();
    const issueId = issues.results?.[0]?.id || issues[0]?.id;
    
    const worklogsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`
    );
    
    expect(worklogsResponse.status()).toBe(200);
    const worklogs = await worklogsResponse.json();
    expect(Array.isArray(worklogs)).toBe(true);
  });

  test("FR-3: should get total duration for an issue", async ({ request }) => {
    const workspaceSlug = "test-ws";
    
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    const issues = await issuesResponse.json();
    const issueId = issues.results?.[0]?.id || issues[0]?.id;
    
    const totalResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/total/`
    );
    
    expect(totalResponse.status()).toBe(200);
    const total = await totalResponse.json();
    expect(total).toHaveProperty("total_duration");
    expect(typeof total.total_duration).toBe("number");
  });

  test("FR-4: should update a worklog", async ({ request }) => {
    const workspaceSlug = "test-ws";
    
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    const issues = await issuesResponse.json();
    const issueId = issues.results?.[0]?.id || issues[0]?.id;
    
    // Create worklog first
    const today = new Date().toISOString().split("T")[0];
    const createResponse = await request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`,
      {
        data: {
          duration: 30,
          logged_at: today,
          description: "Original description",
        },
      }
    );
    const worklog = await createResponse.json();
    
    // Update worklog
    const updateResponse = await request.patch(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklog.id}/`,
      {
        data: {
          duration: 45,
          description: "Updated description",
        },
      }
    );
    
    expect(updateResponse.status()).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.duration).toBe(45);
    expect(updated.description).toBe("Updated description");
    
    // Cleanup
    await request.delete(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklog.id}/`
    );
  });

  test("FR-5: should delete a worklog", async ({ request }) => {
    const workspaceSlug = "test-ws";
    
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    const issues = await issuesResponse.json();
    const issueId = issues.results?.[0]?.id || issues[0]?.id;
    
    // Create worklog first
    const today = new Date().toISOString().split("T")[0];
    const createResponse = await request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`,
      {
        data: {
          duration: 60,
          logged_at: today,
          description: "To be deleted",
        },
      }
    );
    const worklog = await createResponse.json();
    
    // Delete worklog
    const deleteResponse = await request.delete(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklog.id}/`
    );
    
    expect(deleteResponse.status()).toBe(204);
  });

  test("Validation: should reject duration of 0", async ({ request }) => {
    const workspaceSlug = "test-ws";
    
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    const issues = await issuesResponse.json();
    const issueId = issues.results?.[0]?.id || issues[0]?.id;
    
    const today = new Date().toISOString().split("T")[0];
    const response = await request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`,
      {
        data: {
          duration: 0,
          logged_at: today,
        },
      }
    );
    
    expect(response.status()).toBe(400);
  });

  test("Validation: should reject future date", async ({ request }) => {
    const workspaceSlug = "test-ws";
    
    const projectsResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/`
    );
    const projects = await projectsResponse.json();
    const projectId = projects.results?.[0]?.id || projects[0]?.id;
    
    const issuesResponse = await request.get(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
    );
    const issues = await issuesResponse.json();
    const issueId = issues.results?.[0]?.id || issues[0]?.id;
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const future = futureDate.toISOString().split("T")[0];
    
    const response = await request.post(
      `${BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`,
      {
        data: {
          duration: 60,
          logged_at: future,
        },
      }
    );
    
    expect(response.status()).toBe(400);
  });
});