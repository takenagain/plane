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
import { IssueRecurrenceProperties } from "./recurrence-properties";
import type { TIssueOperations } from "./root";
import { IssueDetailSidebarSections } from "./sidebar-sections";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  isEditable: boolean;
};

export const IssueDetailsSidebar = observer(function IssueDetailsSidebar(props: Props) {
  const { workspaceSlug, projectId, issueId, issueOperations, isEditable } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);

  return (
    <div className="h-full w-full overflow-hidden overflow-y-auto px-6 py-6">
      <IssueTimeTrackingActions
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={!isEditable}
        isIntakeIssue={!!issue?.is_intake}
      />
      <IssueDetailSidebarSections
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        issueOperations={issueOperations}
        disabled={!isEditable}
        showUpdatedMeta
      />
      {issue && (
        <IssueRecurrenceProperties
          issue={issue}
          disabled={!isEditable}
          updateIssue={(data) => issueOperations.update(workspaceSlug, projectId, issueId, data)}
        />
      )}
      <IssueWorklogProperty
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={!isEditable}
      />
      {issue && (
        <WorkItemAdditionalSidebarProperties
          workItemId={issue.id}
          workItemTypeId={issue.type_id}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
          isEditable={isEditable}
        />
      )}
    </div>
  );
});
