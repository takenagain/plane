/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IActiveWorklog, IWorklog } from "@plane/types";

const serviceMocks = vi.hoisted(() => ({
  getActive: vi.fn(),
  getTotal: vi.fn(),
  startTracking: vi.fn(),
}));

vi.mock("@plane/services", () => ({
  WorklogService: class {
    getActive = serviceMocks.getActive;
    getTotal = serviceMocks.getTotal;
    startTracking = serviceMocks.startTracking;
  },
}));

import { WorklogStore } from "../worklog.store";

const staleActiveWorklog: IActiveWorklog = {
  id: "worklog-1",
  issue: "issue-1",
  issue_name: "Stale work item",
  actor: "user-1",
  description: "",
  duration: 0,
  logged_at: "2026-03-17",
  project: "project-1",
  workspace: "workspace-id",
  workspace_slug: "demo-workspace",
  created_at: "2026-03-17T10:00:00.000Z",
  updated_at: "2026-03-17T10:00:00.000Z",
  created_by: "user-1",
};

const activeWorklog: IWorklog = {
  id: "worklog-2",
  issue: "issue-2",
  actor: "user-1",
  description: "",
  duration: 0,
  logged_at: "2026-03-17",
  project: "project-2",
  workspace: "workspace-id",
  created_at: "2026-03-17T11:00:00.000Z",
  updated_at: "2026-03-17T11:00:00.000Z",
  created_by: "user-1",
};

describe("WorklogStore.fetchActiveWorklog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears stale active timer state when bootstrap fails", async () => {
    const store = new WorklogStore();
    store.activeWorklog = staleActiveWorklog;
    serviceMocks.getActive.mockRejectedValueOnce(new Error("bootstrap failed"));

    await expect(store.fetchActiveWorklog("demo-workspace")).rejects.toThrow("bootstrap failed");

    expect(store.activeWorklog).toBeNull();
    expect(store.activeWorklogError).toBe("Failed to restore the active timer.");
    expect(store.hasBootstrappedActiveWorklog).toBe(true);
    expect(store.isBootstrappingActiveWorklog).toBe(false);
  });

  it("does not let a stale bootstrap response overwrite a newly started timer", async () => {
    let resolveBootstrap: ((value: IActiveWorklog | null) => void) | undefined;
    serviceMocks.getActive.mockImplementationOnce(
      () =>
        new Promise<IActiveWorklog | null>((resolve) => {
          resolveBootstrap = resolve;
        })
    );
    serviceMocks.startTracking.mockResolvedValueOnce(activeWorklog);
    serviceMocks.getTotal.mockResolvedValueOnce({ total_duration: 0 });

    const store = new WorklogStore();
    const bootstrapPromise = store.fetchActiveWorklog("demo-workspace");

    await store.startTracking("demo-workspace", "project-2", "issue-2", { issueName: "Tracked work item" });

    resolveBootstrap?.(null);
    await expect(bootstrapPromise).resolves.toBeNull();

    expect(store.activeWorklog).toMatchObject({
      ...activeWorklog,
      issue_name: "Tracked work item",
      workspace_slug: "demo-workspace",
    });
    expect(store.activeWorklogError).toBeNull();
    expect(store.hasBootstrappedActiveWorklog).toBe(true);
    expect(store.isBootstrappingActiveWorklog).toBe(false);
  });
});
