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

type TDescendantIssueRef = {
  issueId: string;
  projectId: string;
};

const MAX_DESCENDANT_FETCH_REQUESTS = 50;
const descendantIssueCache = new Map<string, TDescendantIssueRef[]>();

export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const rootStore = useContext(StoreContext);
  const { worklogStore } = rootStore;
  const fetchTotal = worklogStore?.fetchTotal;
  const issueService = useMemo(() => new IssueService(), []);
  const [descendantIssues, setDescendantIssues] = useState<TDescendantIssueRef[]>([]);
  const cacheKey = `${workspaceSlug}:${projectId}:${issueId}`;

  useEffect(() => {
    if (!disabled && workspaceSlug && projectId && issueId && fetchTotal) {
      void fetchTotal(workspaceSlug, projectId, issueId);
    }
  }, [disabled, workspaceSlug, projectId, issueId, fetchTotal]);

  useEffect(() => {
    if (disabled || !workspaceSlug || !projectId || !issueId || !fetchTotal) {
      setDescendantIssues((previousIssues) => (previousIssues.length === 0 ? previousIssues : []));
      return;
    }

    let cancelled = false;

    const hydrateDescendantTotals = async (issues: TDescendantIssueRef[]) => {
      if (issues.length === 0) {
        if (!cancelled) setDescendantIssues((previousIssues) => (previousIssues.length === 0 ? previousIssues : []));
        return;
      }

      await Promise.all(
        issues.map((descendantIssue) => fetchTotal(workspaceSlug, descendantIssue.projectId, descendantIssue.issueId))
      );

      if (!cancelled) {
        setDescendantIssues((previousIssues) => {
          if (
            previousIssues.length === issues.length &&
            previousIssues.every(
              (previousIssue, index) =>
                previousIssue.issueId === issues[index]?.issueId && previousIssue.projectId === issues[index]?.projectId
            )
          ) {
            return previousIssues;
          }
          return issues;
        });
      }
    };

    const fetchDescendantIssueTotals = async () => {
      try {
        const cachedIssues = descendantIssueCache.get(cacheKey);
        if (cachedIssues) {
          await hydrateDescendantTotals(cachedIssues);
          return;
        }

        const visitedIssueIds = new Set<string>([issueId]);
        const discoveredIssues: TDescendantIssueRef[] = [];
        let requestCount = 0;

        const fetchIssueBatch = async (queue: TDescendantIssueRef[]): Promise<void> => {
          if (queue.length === 0 || requestCount >= MAX_DESCENDANT_FETCH_REQUESTS) {
            return;
          }

          const remainingRequests = MAX_DESCENDANT_FETCH_REQUESTS - requestCount;
          const currentBatch = queue.splice(0, remainingRequests);
          requestCount += currentBatch.length;

          const batchResponses = await Promise.all(
            currentBatch.map(async (currentIssueRef) => ({
              currentIssueRef,
              response: await issueService.subIssues(workspaceSlug, currentIssueRef.projectId, currentIssueRef.issueId),
            }))
          );
          if (cancelled) return;

          batchResponses.forEach(({ currentIssueRef, response }) => {
            const subIssuesResponse = response?.sub_issues;
            const subIssueList: TIssue[] = Array.isArray(subIssuesResponse)
              ? subIssuesResponse
              : Object.values(subIssuesResponse ?? {}).flat();

            const childIssueRefs = subIssueList
              .map((subIssue) => ({
                issueId: subIssue.id,
                projectId:
                  typeof subIssue.project_id === "string" && subIssue.project_id.length > 0
                    ? subIssue.project_id
                    : currentIssueRef.projectId,
              }))
              .filter(
                (subIssue): subIssue is TDescendantIssueRef =>
                  typeof subIssue.issueId === "string" &&
                  subIssue.issueId.length > 0 &&
                  typeof subIssue.projectId === "string" &&
                  subIssue.projectId.length > 0
              );

            childIssueRefs.forEach((childIssueRef) => {
              if (visitedIssueIds.has(childIssueRef.issueId)) return;
              visitedIssueIds.add(childIssueRef.issueId);
              discoveredIssues.push(childIssueRef);
              queue.push(childIssueRef);
            });
          });

          if (queue.length > 0) {
            await fetchIssueBatch(queue);
          }
        };

        await fetchIssueBatch([{ issueId, projectId }]);
        descendantIssueCache.set(cacheKey, discoveredIssues);
        await hydrateDescendantTotals(discoveredIssues);
      } catch {
        if (!cancelled) setDescendantIssues((previousIssues) => (previousIssues.length === 0 ? previousIssues : []));
        // Keep parent display resilient even if child aggregation fetch fails.
      }
    };

    void fetchDescendantIssueTotals();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, disabled, workspaceSlug, projectId, issueId, issueService, fetchTotal]);

  if (!worklogStore || disabled) return <></>;

  const issueTotalMinutes = worklogStore.totalByIssue[issueId] ?? 0;
  const descendantIssuesTotalMinutes = descendantIssues.reduce(
    (total, descendantIssue) => total + (worklogStore.totalByIssue[descendantIssue.issueId] ?? 0),
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
