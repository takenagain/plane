/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Clock, Play, Square } from "lucide-react";
import { EUserPermissions } from "@plane/constants";
import { Button } from "@plane/propel/button";
import type { IWorklog } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// store
import { StoreContext } from "@/lib/store-context";
// components
import { WorklogForm } from "../activity/worklog-form";

type TIssueTimeTrackingActions = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  isIntakeIssue?: boolean;
  className?: string;
};

export const IssueTimeTrackingActions = observer(function IssueTimeTrackingActions(props: TIssueTimeTrackingActions) {
  const { workspaceSlug, projectId, issueId, disabled, isIntakeIssue = false, className = "" } = props;
  const rootStore = useContext(StoreContext);
  const { worklogStore } = rootStore;
  const { data: currentUser } = useUser();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const {
    issue: { getIssueById },
    fetchIssue,
  } = useIssueDetail();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const issue = getIssueById(issueId);
  const currentUserProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const isAdmin = currentUserProjectRole === EUserPermissions.ADMIN;
  const isGuest = currentUserProjectRole === EUserPermissions.GUEST;
  const isAssigned = issue?.assignee_ids && currentUser?.id ? issue.assignee_ids.includes(currentUser.id) : false;
  const isWorklogButtonEnabled = !isIntakeIssue && !isGuest && (isAdmin || isAssigned);

  useEffect(() => {
    if (!isWorklogButtonEnabled || !workspaceSlug || !projectId || !issueId) {
      return;
    }

    if (worklogStore.worklogsByIssue[issueId] === undefined) {
      void worklogStore.fetchWorklogs(workspaceSlug, projectId, issueId);
    }
  }, [worklogStore, isWorklogButtonEnabled, workspaceSlug, projectId, issueId]);

  const activeWorklog = !currentUser?.id
    ? undefined
    : (worklogStore.worklogsByIssue[issueId] ?? []).find(
        (worklog: IWorklog) => worklog.actor === currentUser.id && worklog.duration === 0
      );

  useEffect(() => {
    if (!activeWorklog) return;

    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeWorklog]);

  const getActiveSessionDuration = () => {
    if (!activeWorklog) return "";

    const createdAtMs = new Date(activeWorklog.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) return "00:00:00";

    const elapsedSeconds = Math.max(0, Math.floor((nowTick - createdAtMs) / 1000));
    const hours = String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  };

  const refreshIssueDetails = async () => {
    await fetchIssue(workspaceSlug, projectId, issueId);
  };

  const handleStart = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await worklogStore.startTracking(workspaceSlug, projectId, issueId);
      await refreshIssueDetails();
    } catch {
      setError("Failed to start tracking time.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await worklogStore.stopTracking(workspaceSlug, projectId, issueId);
      await refreshIssueDetails();
    } catch {
      setError("Failed to stop tracking time.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    void refreshIssueDetails();
  };

  if (!isWorklogButtonEnabled || disabled) return <></>;

  return (
    <div className={`space-y-2 ${className}`} data-testid="issue-time-tracking-actions">
      <div className="flex flex-wrap items-center gap-2">
        {!isFormOpen && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => setIsFormOpen(true)}
            className="min-w-fit"
            data-testid="issue-time-log-button"
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="text-body-xs-medium">Log time</span>
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={isSubmitting}
          onClick={() => {
            if (activeWorklog) {
              void handleStop();
            } else {
              void handleStart();
            }
          }}
          className="min-w-fit"
          data-testid="issue-time-start-stop-button"
        >
          {activeWorklog ? <Square className="h-3.5 w-3.5 shrink-0" /> : <Play className="h-3.5 w-3.5 shrink-0" />}
          <span className="text-body-xs-medium">{activeWorklog ? "Stop" : "Start"}</span>
        </Button>
        {activeWorklog && (
          <span
            aria-label="Current session timer"
            className="inline-flex items-center rounded-md bg-layer-2 px-2 py-1 text-caption-sm-medium text-secondary"
            data-testid="issue-time-session-timer"
          >
            {getActiveSessionDuration()}
          </span>
        )}
      </div>

      {isFormOpen && (
        <WorklogForm workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} onClose={handleFormClose} />
      )}

      {error && <p className="text-red-500 text-caption-sm-regular">{error}</p>}
    </div>
  );
});
