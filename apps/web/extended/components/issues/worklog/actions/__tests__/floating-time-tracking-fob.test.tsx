/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IActiveWorklog } from "@plane/types";
import { FloatingTimeTrackingFOB } from "../floating-time-tracking-fob";

const controllerMock = {
  formatActiveDurationCompact: vi.fn(() => "12m 04s"),
  formatActiveDurationFull: vi.fn(() => "00:12:04"),
  openTrackedWorkItem: vi.fn(),
  startTracking: vi.fn(),
  stopTracking: vi.fn(),
};

vi.mock("@/plane-web/hooks/use-active-worklog-controller", () => ({
  useActiveWorklogController: () => controllerMock,
}));

const activeWorklog: IActiveWorklog = {
  id: "worklog-1",
  issue: "issue-1",
  issue_name: "Tracked work item",
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

describe("FloatingTimeTrackingFOB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed inactive state with compact total text", () => {
    render(
      <FloatingTimeTrackingFOB
        activeWorklog={null}
        currentWorklogTarget={{
          workspaceSlug: "demo-workspace",
          projectId: "project-1",
          issueId: "issue-1",
          issueName: "Current work item",
        }}
        totalMinutes={125}
      />
    );

    expect(screen.getByTestId("floating-time-tracking-fob-primary-button")).toHaveAttribute(
      "aria-label",
      "Start time tracking"
    );
    expect(screen.getByTestId("floating-time-tracking-fob-primary-button")).toHaveClass(
      "border-success-strong",
      "bg-success-primary",
      "text-on-color"
    );
    expect(screen.queryByTestId("floating-time-tracking-fob-primary-label")).not.toBeInTheDocument();
    expect(screen.getByTestId("floating-time-tracking-fob-compact-time")).toHaveTextContent("2h 5m");
  });

  it("expands to show the full active timer text", () => {
    render(<FloatingTimeTrackingFOB activeWorklog={activeWorklog} currentWorklogTarget={null} totalMinutes={0} />);

    fireEvent.mouseEnter(screen.getByTestId("floating-time-tracking-fob"));

    expect(screen.getByTestId("floating-time-tracking-fob-expanded")).toBeInTheDocument();
    expect(screen.getByTestId("floating-time-tracking-fob-primary-button")).toHaveClass(
      "border-danger-strong",
      "bg-danger-primary",
      "text-on-color"
    );
    expect(screen.getByTestId("floating-time-tracking-fob-primary-label")).toHaveTextContent("Stop");
    expect(screen.getByTestId("floating-time-tracking-fob-full-time")).toHaveTextContent("00:12:04");
  });

  it("navigates when the expanded title link is clicked", () => {
    render(<FloatingTimeTrackingFOB activeWorklog={activeWorklog} currentWorklogTarget={null} totalMinutes={0} />);

    fireEvent.mouseEnter(screen.getByTestId("floating-time-tracking-fob"));
    fireEvent.click(screen.getByTestId("floating-time-tracking-fob-title-link"));

    expect(controllerMock.openTrackedWorkItem).toHaveBeenCalledWith(activeWorklog);
  });
});
