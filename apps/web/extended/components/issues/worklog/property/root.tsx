/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useContext, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// store
import { StoreContext } from "@/lib/store-context";
import { IssueService } from "@/services/issue";
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

const MAX_DESCENDANT_FETCH_REQUESTS = 50;

export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const rootStore = useContext(StoreContext);
  const { worklogStore } = rootStore;
  const issueService = useMemo(() => new IssueService(), []);
  const [descendantIssueIds, setDescendantIssueIds] = useState<string[]>([]);

  useEffect(() => {
    if (!disabled && workspaceSlug && projectId && issueId && worklogStore) {
      void worklogStore.fetchTotal(workspaceSlug, projectId, issueId);
    }
  }, [disabled, workspaceSlug, projectId, issueId, worklogStore]);

  useEffect(() => {
    if (disabled || !workspaceSlug || !projectId || !issueId || !worklogStore) {
      setDescendantIssueIds((previousIds) => (previousIds.length === 0 ? previousIds : []));
      return;
    }

    let cancelled = false;

    const fetchDescendantIssueTotals = async () => {
      try {
        const visitedIssueIds = new Set<string>([issueId]);
        const discoveredIssueIds: string[] = [];
        const queue: string[] = [issueId];
        let requestCount = 0;

        while (queue.length > 0) {
          if (requestCount >= MAX_DESCENDANT_FETCH_REQUESTS) {
            break;
          }
          const currentIssueId = queue.shift();
          if (!currentIssueId) continue;
          requestCount += 1;

          const response = await issueService.subIssues(workspaceSlug, projectId, currentIssueId);
          if (cancelled) return;

          const subIssuesResponse = response?.sub_issues;
          const subIssueList: TIssue[] = Array.isArray(subIssuesResponse)
            ? subIssuesResponse
            : Object.values(subIssuesResponse ?? {}).flat();

          const childIssueIds = subIssueList
            .map((subIssue) => subIssue.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);

          childIssueIds.forEach((childIssueId) => {
            if (visitedIssueIds.has(childIssueId)) return;
            visitedIssueIds.add(childIssueId);
            discoveredIssueIds.push(childIssueId);
            queue.push(childIssueId);
          });
        }

        if (discoveredIssueIds.length === 0) {
          if (!cancelled) setDescendantIssueIds((previousIds) => (previousIds.length === 0 ? previousIds : []));
          return;
        }

        await Promise.all(
          discoveredIssueIds.map((descendantIssueId) =>
            worklogStore.fetchTotal(workspaceSlug, projectId, descendantIssueId)
          )
        );

        if (!cancelled) {
          setDescendantIssueIds((previousIds) => {
            if (
              previousIds.length === discoveredIssueIds.length &&
              previousIds.every((previousId, index) => previousId === discoveredIssueIds[index])
            ) {
              return previousIds;
            }
            return discoveredIssueIds;
          });
        }
      } catch {
        if (!cancelled) setDescendantIssueIds((previousIds) => (previousIds.length === 0 ? previousIds : []));
        // Keep parent display resilient even if child aggregation fetch fails.
      }
    };

    void fetchDescendantIssueTotals();

    return () => {
      cancelled = true;
    };
  }, [disabled, workspaceSlug, projectId, issueId, issueService, worklogStore]);

  if (!worklogStore || disabled) return <></>;

  const issueTotalMinutes = worklogStore.totalByIssue[issueId] ?? 0;
  const descendantIssuesTotalMinutes = descendantIssueIds.reduce(
    (total, descendantIssueId) => total + (worklogStore.totalByIssue[descendantIssueId] ?? 0),
    0
  );
  const totalMinutes = issueTotalMinutes + descendantIssuesTotalMinutes;

  return (
    <SidebarPropertyListItem icon={Clock} label={t("common.time_logged")}>
      <span className="text-body-xs-regular text-secondary" data-testid="issue-worklog-property-value">
        {formatDuration(totalMinutes)}
      </span>
    </SidebarPropertyListItem>
  );
});
