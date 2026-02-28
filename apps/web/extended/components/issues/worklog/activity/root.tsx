/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect, useContext } from "react";
import { observer } from "mobx-react";
import { Clock, Pencil, Trash2 } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { renderFormattedTime, renderFormattedDate, calculateTimeAgo } from "@plane/utils";
import type { IWorklog, TIssueActivityComment } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// store
import { StoreContext } from "@/lib/store-context";
// helpers
import { formatDuration } from "@/plane-web/helpers/worklog.helpers";
// components
import { WorklogForm } from "./worklog-form";

type TIssueActivityWorklog = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  activityComment: TIssueActivityComment;
  ends?: "top" | "bottom";
};

export const IssueActivityWorklog = observer(function IssueActivityWorklog(props: TIssueActivityWorklog) {
  const { workspaceSlug, projectId, issueId, activityComment, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const { data: currentUser } = useUser();
  const { isMobile } = usePlatformOS();

  const rootStore = useContext(StoreContext);
  const { worklogStore } = rootStore;

  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const activity = getActivityById(activityComment.id);

  const isOwner = currentUser?.id === activity?.actor;
  // For now, allow edit/delete for the owner. Admin check would require additional role check.
  const canModify = isOwner;

  const linkedWorklog = activity?.new_identifier
    ? (worklogStore?.worklogsByIssue?.[issueId] ?? []).find(
        (worklog: IWorklog) => worklog.id === activity.new_identifier
      )
    : undefined;

  // Resolve the worklog object from the store when editing
  const worklogFromActivity = isEditing ? linkedWorklog : undefined;

  useEffect(() => {
    if (!activity?.new_identifier || !worklogStore || worklogStore.worklogsByIssue[issueId] !== undefined) {
      return;
    }

    void worklogStore.fetchWorklogs(workspaceSlug, projectId, issueId);
  }, [activity?.new_identifier, issueId, projectId, workspaceSlug, worklogStore]);

  // If we're in editing mode but can't find the worklog in the store,
  // reset edit state safely via useEffect (never call setState during render).
  useEffect(() => {
    if (isEditing && activity?.new_identifier && !worklogFromActivity) {
      setIsEditing(false);
    }
  }, [isEditing, activity?.new_identifier, worklogFromActivity]);

  if (!activity) return <></>;

  const isActiveTracking = linkedWorklog?.duration === 0;

  useEffect(() => {
    if (!isActiveTracking) return;

    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isActiveTracking]);

  const getWorklogDurationLabel = () => {
    if (!linkedWorklog) return activity.new_value ?? "0m";

    if (linkedWorklog.duration === 0) {
      const createdAtMs = new Date(linkedWorklog.created_at).getTime();
      if (!Number.isFinite(createdAtMs)) return "0h 0m";
      const elapsedMinutes = Math.max(0, Math.floor((nowTick - createdAtMs) / 60000));
      return formatDuration(elapsedMinutes);
    }

    return formatDuration(linkedWorklog.duration);
  };

  const workItemName = activity.issue_detail?.name ?? "work item";

  const getActivityMessage = () => {
    switch (activity.verb) {
      case "created":
        return (
          <>
            Logged <span className="font-medium">{getWorklogDurationLabel()}</span>
            {" on "}
            <span className="font-medium">{workItemName}</span>
          </>
        );
      case "updated":
        if (activity.old_value && activity.new_value) {
          return (
            <>
              updated worklog from <span className="font-medium">{activity.old_value}</span>
              {" to "}
              <span className="font-medium">{activity.new_value}</span>
            </>
          );
        }
        return <>updated a worklog</>;
      case "deleted":
        return (
          <>
            removed a worklog of <span className="font-medium">{activity.old_value}</span>
          </>
        );
      default:
        return <>performed a worklog action</>;
    }
  };

  const handleDelete = async () => {
    if (!worklogStore || !activity.new_identifier) return;
    setIsDeleting(true);
    try {
      await worklogStore.deleteWorklog(workspaceSlug, projectId, issueId, activity.new_identifier);
    } catch {
      // Error is handled by the store; the activity entry remains
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    // Ensure worklogs are fetched so we can find the record for the edit form
    if (worklogStore && !worklogStore.worklogsByIssue[issueId]) {
      void worklogStore.fetchWorklogs(workspaceSlug, projectId, issueId).then(() => {
        setIsEditing(true);
      });
    } else {
      setIsEditing(true);
    }
  };

  // Render the edit form when editing and the worklog data is available
  if (isEditing && worklogFromActivity) {
    return (
      <div className={`relative ${ends === "top" ? "pb-2" : ends === "bottom" ? "pt-2" : "py-2"}`}>
        <WorklogForm
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          onClose={() => setIsEditing(false)}
          existingWorklog={worklogFromActivity}
        />
      </div>
    );
  }

  return (
    <div
      className={`group relative flex items-center gap-3 text-caption-sm-regular ${ends === "top" ? "pb-2" : ends === "bottom" ? "pt-2" : "py-2"}`}
    >
      <div className="absolute left-[13px] top-0 bottom-0 w-px bg-layer-3" aria-hidden />
      <div className="flex-shrink-0 w-7 h-7 rounded-lg overflow-hidden flex justify-center items-center z-[4] bg-layer-2 text-secondary border border-subtle shadow-raised-100">
        <Clock className="w-3.5 h-3.5" />
      </div>
      <div className="w-full flex items-center justify-between gap-2">
        <div className="truncate text-secondary">
          <span className="font-medium text-primary">{activity.actor_detail?.display_name ?? "Someone"}</span>{" "}
          <span>{getActivityMessage()}</span>
          <span>
            <Tooltip
              isMobile={isMobile}
              tooltipContent={`${renderFormattedDate(activity.created_at)}, ${renderFormattedTime(activity.created_at)}`}
            >
              <span className="whitespace-nowrap text-tertiary"> {calculateTimeAgo(activity.created_at)}</span>
            </Tooltip>
          </span>
        </div>
        {canModify && activity.verb === "created" && (
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleEdit}
              className="rounded p-1 text-tertiary hover:text-primary hover:bg-layer-3 transition-colors"
              aria-label="Edit worklog"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded p-1 text-tertiary hover:text-red-500 hover:bg-layer-3 transition-colors disabled:opacity-50"
              aria-label="Delete worklog"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
