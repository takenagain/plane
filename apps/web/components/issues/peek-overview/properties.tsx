/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane web components
import { WorkItemAdditionalSidebarProperties } from "@/plane-web/components/issues/issue-details/additional-properties";
import { IssueTimeTrackingActions } from "@/plane-web/components/issues/worklog/actions";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import type { TIssueOperations } from "../issue-detail";
import { IssueRecurrenceProperties } from "../issue-detail/recurrence-properties";
import { IssueDetailSidebarSections } from "../issue-detail/sidebar-sections";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);

  return (
    <div className="flex w-full flex-col gap-4 py-6">
      <IssueTimeTrackingActions
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
        isIntakeIssue={!!issue?.is_intake}
      />
      <IssueDetailSidebarSections
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        issueOperations={issueOperations}
        disabled={disabled}
      />
      {issue && (
        <IssueRecurrenceProperties
          issue={issue}
          disabled={disabled}
          updateIssue={(data) => issueOperations.update(workspaceSlug, projectId, issueId, data)}
          textClassName="text-body-xs-medium"
        />
      )}
      <IssueWorklogProperty workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={disabled} />
      {issue && (
        <WorkItemAdditionalSidebarProperties
          workItemId={issue.id}
          workItemTypeId={issue.type_id}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
          isEditable={!disabled}
          isPeekView
        />
      )}
    </div>
  );
});
