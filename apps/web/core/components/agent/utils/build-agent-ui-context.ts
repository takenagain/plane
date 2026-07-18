/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type {
  EIssueLayoutTypes,
  TAgentUIContext,
  TAgentUIContextViewLayout,
  TAgentUIContextViewSurface,
  TIssue,
} from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useRouterParams } from "@/hooks/store/use-router-params";
import { useIssues } from "@/hooks/store/use-issues";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";

const MAX_DESCRIPTION_LENGTH = 200;
const MAX_AVAILABLE_PROJECTS = 50;

const truncate = (value: string | undefined | null, maxLength = MAX_DESCRIPTION_LENGTH): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
};

const toLayout = (layout: EIssueLayoutTypes | undefined): TAgentUIContextViewLayout => {
  if (!layout) return null;
  return layout as TAgentUIContextViewLayout;
};

const buildWorkItemIdentifier = (projectIdentifier: string | undefined, issue: TIssue): string => {
  if (projectIdentifier) return `${projectIdentifier}-${issue.sequence_id}`;
  return issue.id;
};

const issueIdentityKey = (issue: TIssue | undefined): string =>
  issue
    ? [
        issue.id,
        issue.name,
        issue.sequence_id,
        issue.project_id,
        issue.priority,
        issue.state_id,
        issue.assignee_ids?.join(","),
      ].join("|")
    : "";

type TOpenWorkItemInputs = {
  workspaceSlug: string;
  routerProjectId: string | undefined;
  routerIssueId: string | undefined;
  routerWorkItemParam: string | undefined;
  peekIssueId: string | undefined;
  peekIssueProjectId: string | undefined;
  peekIssueWorkspaceSlug: string | undefined;
  peekIssueRecord: TIssue | undefined;
  browseIssueRecord: TIssue | undefined;
  routeIssueRecord: TIssue | undefined;
  peekIssueProjectIdentifier: string | undefined;
  browseIssueProjectIdentifier: string | undefined;
  routeIssueProjectIdentifier: string | undefined;
};

const resolveOpenWorkItem = ({
  workspaceSlug,
  routerProjectId,
  routerIssueId,
  routerWorkItemParam,
  peekIssueId,
  peekIssueProjectId,
  peekIssueWorkspaceSlug,
  peekIssueRecord,
  browseIssueRecord,
  routeIssueRecord,
  peekIssueProjectIdentifier,
  browseIssueProjectIdentifier,
  routeIssueProjectIdentifier,
}: TOpenWorkItemInputs): TAgentUIContext["open_work_item"] => {
  if (peekIssueId && peekIssueWorkspaceSlug === workspaceSlug) {
    if (peekIssueRecord) {
      return {
        presentation: "peek",
        id: peekIssueRecord.id,
        identifier: buildWorkItemIdentifier(peekIssueProjectIdentifier, peekIssueRecord),
        name: peekIssueRecord.name,
        project_id: peekIssueRecord.project_id ?? peekIssueProjectId ?? "",
        priority: peekIssueRecord.priority,
        state_id: peekIssueRecord.state_id,
        assignees: peekIssueRecord.assignee_ids?.length ? peekIssueRecord.assignee_ids : undefined,
      };
    }
    return {
      presentation: "peek",
      id: peekIssueId,
      project_id: peekIssueProjectId ?? "",
    };
  }

  if (routerWorkItemParam) {
    if (browseIssueRecord) {
      return {
        presentation: "browse",
        id: browseIssueRecord.id,
        identifier: buildWorkItemIdentifier(browseIssueProjectIdentifier, browseIssueRecord),
        name: browseIssueRecord.name,
        project_id: browseIssueRecord.project_id ?? "",
        priority: browseIssueRecord.priority,
        state_id: browseIssueRecord.state_id,
        assignees: browseIssueRecord.assignee_ids?.length ? browseIssueRecord.assignee_ids : undefined,
      };
    }
    return {
      presentation: "browse",
      identifier: routerWorkItemParam,
      ...(routerProjectId ? { project_id: routerProjectId } : {}),
    };
  }

  if (routerIssueId) {
    if (!routeIssueRecord) return null;
    return {
      presentation: "full_page",
      id: routeIssueRecord.id,
      identifier: buildWorkItemIdentifier(routeIssueProjectIdentifier, routeIssueRecord),
      name: routeIssueRecord.name,
      project_id: routeIssueRecord.project_id ?? routerProjectId ?? "",
      priority: routeIssueRecord.priority,
      state_id: routeIssueRecord.state_id,
      assignees: routeIssueRecord.assignee_ids?.length ? routeIssueRecord.assignee_ids : undefined,
    };
  }

  return null;
};

const resolveViewSurface = (args: {
  routerWorkItemParam: string | undefined;
  routerCycleId: string | undefined;
  routerModuleId: string | undefined;
  routerViewId: string | undefined;
  routerGlobalViewId: string | undefined;
  routerProjectId: string | undefined;
}): TAgentUIContextViewSurface => {
  if (args.routerWorkItemParam) return "browse";
  if (args.routerCycleId) return "cycle";
  if (args.routerModuleId) return "module";
  if (args.routerViewId) return "project_view";
  if (args.routerGlobalViewId) return "workspace_view";
  if (args.routerProjectId) return "project_issues";
  return "other";
};

export const useAgentUIContext = (workspaceSlug: string): TAgentUIContext | undefined => {
  const router = useRouterParams();
  const { data: currentUser, isAuthenticated } = useUser();
  const { currentWorkspace, getWorkspaceBySlug } = useWorkspace();
  const { joinedProjectIds, getProjectById, currentProjectDetails } = useProject();
  const { peekIssue, issue: issueDetailStore } = useIssueDetail();
  const { getIssueById, getIssueIdByIdentifier } = issueDetailStore;
  const { issuesFilter: projectIssuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { issuesFilter: cycleIssuesFilter } = useIssues(EIssuesStoreType.CYCLE);
  const { issuesFilter: moduleIssuesFilter } = useIssues(EIssuesStoreType.MODULE);
  const { issuesFilter: projectViewIssuesFilter } = useIssues(EIssuesStoreType.PROJECT_VIEW);

  // MobX store/function references are stable; depend on primitive route, peek, and loaded entity values instead.
  const routerProjectId = router.projectId;
  const routerIssueId = router.issueId;
  const routerCycleId = router.cycleId;
  const routerModuleId = router.moduleId;
  const routerViewId = router.viewId;
  const routerGlobalViewId = router.globalViewId;
  const routerWorkItemParam = router.query?.workItem?.toString();

  const peekIssueId = peekIssue?.issueId;
  const peekIssueProjectId = peekIssue?.projectId;
  const peekIssueWorkspaceSlug = peekIssue?.workspaceSlug;

  const browseIssueId = routerWorkItemParam ? getIssueIdByIdentifier(routerWorkItemParam) : undefined;
  const peekIssueRecord = peekIssueId ? getIssueById(peekIssueId) : undefined;
  const browseIssueRecord = browseIssueId ? getIssueById(browseIssueId) : undefined;
  const routeIssueRecord = routerIssueId ? getIssueById(routerIssueId) : undefined;

  const workspace = getWorkspaceBySlug(workspaceSlug) ?? currentWorkspace;
  const workspaceId = workspace?.id;
  const workspaceName = workspace?.name;

  const userId = currentUser?.id;
  const userDisplayName = currentUser?.display_name;
  const userEmail = currentUser?.email;

  const peekIssueIdentity = issueIdentityKey(peekIssueRecord);
  const browseIssueIdentity = issueIdentityKey(browseIssueRecord);
  const routeIssueIdentity = issueIdentityKey(routeIssueRecord);

  const peekIssueProject = peekIssueRecord?.project_id ? getProjectById(peekIssueRecord.project_id) : undefined;
  const browseIssueProject = browseIssueRecord?.project_id ? getProjectById(browseIssueRecord.project_id) : undefined;
  const routeIssueProject = routeIssueRecord?.project_id ? getProjectById(routeIssueRecord.project_id) : undefined;

  const peekIssueProjectIdentifier = peekIssueProject?.identifier;
  const browseIssueProjectIdentifier = browseIssueProject?.identifier;
  const routeIssueProjectIdentifier = routeIssueProject?.identifier;

  const projectIssuesLayout = routerProjectId
    ? projectIssuesFilter.getIssueFilters(routerProjectId)?.displayFilters?.layout
    : undefined;
  const cycleIssuesLayout = routerCycleId
    ? cycleIssuesFilter.getIssueFilters(routerCycleId)?.displayFilters?.layout
    : undefined;
  const moduleIssuesLayout = routerModuleId
    ? moduleIssuesFilter.getIssueFilters(routerModuleId)?.displayFilters?.layout
    : undefined;
  const projectViewIssuesLayout = routerViewId
    ? projectViewIssuesFilter.getIssueFilters(routerViewId)?.displayFilters?.layout
    : undefined;

  const joinedProjectsIdentityKey = joinedProjectIds
    .map((id) => {
      const p = getProjectById(id);
      return p ? `${id}:${p.identifier}:${p.name}` : id;
    })
    .join("|");

  const currentProjectDetailsId = currentProjectDetails?.id;

  return useMemo(() => {
    if (!isAuthenticated || !userId || !userDisplayName) return undefined;

    const openWorkItem = resolveOpenWorkItem({
      workspaceSlug,
      routerProjectId,
      routerIssueId,
      routerWorkItemParam,
      peekIssueId,
      peekIssueProjectId,
      peekIssueWorkspaceSlug,
      peekIssueRecord,
      browseIssueRecord,
      routeIssueRecord,
      peekIssueProjectIdentifier,
      browseIssueProjectIdentifier,
      routeIssueProjectIdentifier,
    });

    const resolvedCurrentProjectId = routerProjectId ?? openWorkItem?.project_id ?? currentProjectDetailsId ?? null;

    const availableProjects = joinedProjectIds
      .slice(0, MAX_AVAILABLE_PROJECTS)
      .map((projectId) => {
        const project = getProjectById(projectId);
        if (!project) return null;
        return {
          id: project.id,
          identifier: project.identifier,
          name: project.name,
          is_current: project.id === resolvedCurrentProjectId,
        };
      })
      .filter((project): project is NonNullable<typeof project> => project !== null);

    const resolvedCurrentProject = resolvedCurrentProjectId ? getProjectById(resolvedCurrentProjectId) : undefined;

    const surface = resolveViewSurface({
      routerWorkItemParam,
      routerCycleId,
      routerModuleId,
      routerViewId,
      routerGlobalViewId,
      routerProjectId,
    });

    let layout: TAgentUIContextViewLayout = null;
    if (surface === "project_issues" && routerProjectId) {
      layout = toLayout(projectIssuesLayout);
    } else if (surface === "cycle" && routerCycleId) {
      layout = toLayout(cycleIssuesLayout);
    } else if (surface === "module" && routerModuleId) {
      layout = toLayout(moduleIssuesLayout);
    } else if (surface === "project_view" && routerViewId) {
      layout = toLayout(projectViewIssuesLayout);
    }

    const view: TAgentUIContext["view"] = {
      surface,
      layout,
      ...(routerCycleId ? { cycle_id: routerCycleId } : {}),
      ...(routerModuleId ? { module_id: routerModuleId } : {}),
      ...(routerViewId ? { view_id: routerViewId } : {}),
    };

    return {
      workspace: {
        slug: workspaceSlug,
        ...(workspaceName ? { name: workspaceName } : {}),
        ...(workspaceId ? { id: workspaceId } : {}),
      },
      user: {
        id: userId,
        display_name: userDisplayName,
        ...(userEmail ? { email: userEmail } : {}),
      },
      projects: {
        current_id: resolvedCurrentProjectId,
        available: availableProjects,
      },
      current_project: resolvedCurrentProject
        ? {
            id: resolvedCurrentProject.id,
            identifier: resolvedCurrentProject.identifier,
            name: resolvedCurrentProject.name,
            ...(truncate(resolvedCurrentProject.description)
              ? { description: truncate(resolvedCurrentProject.description) }
              : {}),
          }
        : null,
      view,
      open_work_item: openWorkItem,
    };
    // MobX getters/records are read via primitive identity keys in the dependency list.
  }, [
    isAuthenticated,
    userId,
    userDisplayName,
    userEmail,
    workspaceSlug,
    workspaceId,
    workspaceName,
    routerProjectId,
    routerIssueId,
    routerCycleId,
    routerModuleId,
    routerViewId,
    routerGlobalViewId,
    routerWorkItemParam,
    peekIssueId,
    peekIssueProjectId,
    peekIssueWorkspaceSlug,
    peekIssueIdentity,
    browseIssueIdentity,
    routeIssueIdentity,
    peekIssueProjectIdentifier,
    browseIssueProjectIdentifier,
    routeIssueProjectIdentifier,
    joinedProjectsIdentityKey,
    joinedProjectIds,
    currentProjectDetailsId,
    projectIssuesLayout,
    cycleIssuesLayout,
    moduleIssuesLayout,
    projectViewIssuesLayout,
    getProjectById,
    peekIssueRecord,
    browseIssueRecord,
    routeIssueRecord,
  ]);
};
