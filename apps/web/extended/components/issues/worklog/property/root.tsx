/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useContext } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
// store
import { StoreContext } from "@/lib/store-context";
// helpers
import { formatDuration } from "@/plane-web/helpers/worklog.helpers";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";

type TIssueWorklogProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const rootStore = useContext(StoreContext);
  const worklogStore = (rootStore as any).worklogStore;

  useEffect(() => {
    if (workspaceSlug && projectId && issueId && worklogStore) {
      worklogStore.fetchTotal(workspaceSlug, projectId, issueId);
    }
  }, [workspaceSlug, projectId, issueId, worklogStore]);

  if (!worklogStore) return <></>;

  const totalMinutes = worklogStore.totalByIssue[issueId] ?? 0;

  return (
    <SidebarPropertyListItem icon={Clock} label="Time Logged">
      <span className="text-body-xs-regular text-secondary">{formatDuration(totalMinutes)}</span>
    </SidebarPropertyListItem>
  );
});
