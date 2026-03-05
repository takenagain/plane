/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useContext } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import type { TIssue } from "@plane/types";
// store
import { StoreContext } from "@/lib/store-context";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
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
  const { worklogStore } = rootStore;
  const {
    subIssues: { subIssuesByIssueId },
    fetchSubIssues,
  } = useIssueDetail();
  const loadedSubIssueIds = subIssuesByIssueId(issueId);
  const subIssueIds = loadedSubIssueIds ?? [];

  useEffect(() => {
    if (!disabled && workspaceSlug && projectId && issueId && worklogStore) {
      void worklogStore.fetchTotal(workspaceSlug, projectId, issueId);
    }
  }, [disabled, workspaceSlug, projectId, issueId, worklogStore]);

  useEffect(() => {
    if (disabled || !workspaceSlug || !projectId || !issueId || !worklogStore) {
      return;
    }

    let cancelled = false;

    const fetchSubIssueTotals = async () => {
      try {
        const response = await fetchSubIssues(workspaceSlug, projectId, issueId);
        if (cancelled) return;

        const subIssuesResponse = response?.sub_issues;
        const subIssueList: TIssue[] = Array.isArray(subIssuesResponse)
          ? subIssuesResponse
          : Object.values(subIssuesResponse ?? {}).flat();

        const fetchedSubIssueIds = subIssueList
          .map((subIssue) => subIssue.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        if (fetchedSubIssueIds.length === 0) return;

        await Promise.all(
          fetchedSubIssueIds.map((subIssueId) => worklogStore.fetchTotal(workspaceSlug, projectId, subIssueId))
        );
      } catch {
        // Keep parent display resilient even if child aggregation fetch fails.
      }
    };

    void fetchSubIssueTotals();

    return () => {
      cancelled = true;
    };
  }, [disabled, workspaceSlug, projectId, issueId, fetchSubIssues, worklogStore]);

  if (!worklogStore || disabled) return <></>;

  const issueTotalMinutes = worklogStore.totalByIssue[issueId] ?? 0;
  const subIssuesTotalMinutes = subIssueIds.reduce(
    (total, subIssueId) => total + (worklogStore.totalByIssue[subIssueId] ?? 0),
    0
  );
  const totalMinutes = issueTotalMinutes + subIssuesTotalMinutes;

  return (
    <SidebarPropertyListItem icon={Clock} label="Time Logged">
      <span className="text-body-xs-regular text-secondary" data-testid="issue-worklog-property-value">
        {formatDuration(totalMinutes)}
      </span>
    </SidebarPropertyListItem>
  );
});
