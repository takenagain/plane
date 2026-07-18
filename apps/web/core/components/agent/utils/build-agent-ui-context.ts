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

const resolveOpenWorkItem = (
  workspaceSlug: string,
  router: ReturnType<typeof useRouterParams>,
  peekIssue: ReturnType<typeof useIssueDetail>["peekIssue"],
  getIssueById: (issueId: string) => TIssue | undefined,
  getIssueIdByIdentifier: (issueIdentifier: string) => string | undefined,
  getProjectById: ReturnType<typeof useProject>["getProjectById"]
): TAgentUIContext["open_work_item"] => {
  const workItemParam = router.query?.workItem?.toString();

  if (peekIssue?.issueId && peekIssue.workspaceSlug === workspaceSlug) {
    const issue = getIssueById(peekIssue.issueId);
    if (issue) {
      const project = getProjectById(issue.project_id);
      return {
        presentation: "peek",
        id: issue.id,
        identifier: buildWorkItemIdentifier(project?.identifier, issue),
        name: issue.name,
        project_id: issue.project_id ?? peekIssue.projectId,
        priority: issue.priority,
        state_id: issue.state_id,
        assignees: issue.assignee_ids?.length ? issue.assignee_ids : undefined,
      };
    }
    return {
      presentation: "peek",
      id: peekIssue.issueId,
      project_id: peekIssue.projectId ?? "",
    };
  }

  if (workItemParam) {
    const issueId = getIssueIdByIdentifier(workItemParam);
    const issue = issueId ? getIssueById(issueId) : undefined;
    if (issue) {
      const project = getProjectById(issue.project_id);
      return {
        presentation: "browse",
        id: issue.id,
        identifier: buildWorkItemIdentifier(project?.identifier, issue),
        name: issue.name,
        project_id: issue.project_id ?? "",
        priority: issue.priority,
        state_id: issue.state_id,
        assignees: issue.assignee_ids?.length ? issue.assignee_ids : undefined,
      };
    }
    return {
      presentation: "browse",
      identifier: workItemParam,
      ...(router.projectId ? { project_id: router.projectId } : {}),
    };
  }

  if (router.issueId) {
    const issue = getIssueById(router.issueId);
    if (!issue) return null;
    const project = getProjectById(issue.project_id);
    return {
      presentation: "full_page",
      id: issue.id,
      identifier: buildWorkItemIdentifier(project?.identifier, issue),
      name: issue.name,
      project_id: issue.project_id ?? router.projectId ?? "",
      priority: issue.priority,
      state_id: issue.state_id,
      assignees: issue.assignee_ids?.length ? issue.assignee_ids : undefined,
    };
  }

  return null;
};

const resolveViewSurface = (router: ReturnType<typeof useRouterParams>): TAgentUIContextViewSurface => {
  if (router.query?.workItem) return "browse";
  if (router.cycleId) return "cycle";
  if (router.moduleId) return "module";
  if (router.viewId) return "project_view";
  if (router.globalViewId) return "workspace_view";
  if (router.projectId) return "project_issues";
  return "other";
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
  const peekProjectIdForWorkspace = peekIssueWorkspaceSlug === workspaceSlug ? peekIssueProjectId : undefined;
  const currentProjectId =
    routerProjectId ?? peekProjectIdForWorkspace ?? browseIssueRecord?.project_id ?? currentProjectDetails?.id ?? null;
  const currentProject = currentProjectId ? getProjectById(currentProjectId) : undefined;

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

  const peekIssueProject = peekIssueRecord?.project_id ? getProjectById(peekIssueRecord.project_id) : undefined;
  const browseIssueProject = browseIssueRecord?.project_id ? getProjectById(browseIssueRecord.project_id) : undefined;
  const routeIssueProject = routeIssueRecord?.project_id ? getProjectById(routeIssueRecord.project_id) : undefined;

  const joinedProjectsIdentityKey = joinedProjectIds
    .map((id) => {
      const p = getProjectById(id);
      return p ? `${id}:${p.identifier}:${p.name}` : id;
    })
    .join("|");

  return useMemo(() => {
    if (!isAuthenticated || !currentUser) return undefined;

    const openWorkItem = resolveOpenWorkItem(
      workspaceSlug,
      router,
      peekIssue,
      getIssueById,
      getIssueIdByIdentifier,
      getProjectById
    );

    const resolvedCurrentProjectId = routerProjectId ?? openWorkItem?.project_id ?? currentProjectDetails?.id ?? null;

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

    const surface = resolveViewSurface(router);
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
        ...(workspace?.name ? { name: workspace.name } : {}),
        ...(workspace?.id ? { id: workspace.id } : {}),
      },
      user: {
        id: currentUser.id,
        display_name: currentUser.display_name,
        email: currentUser.email,
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
  }, [
    isAuthenticated,
    currentUser?.id,
    currentUser?.display_name,
    currentUser?.email,
    workspaceSlug,
    workspace?.id,
    workspace?.name,
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
    browseIssueId,
    issueIdentityKey(peekIssueRecord),
    issueIdentityKey(browseIssueRecord),
    issueIdentityKey(routeIssueRecord),
    peekIssueProject?.identifier,
    browseIssueProject?.identifier,
    routeIssueProject?.identifier,
    joinedProjectsIdentityKey,
    currentProjectDetails?.id,
    currentProject?.id,
    currentProject?.identifier,
    currentProject?.name,
    currentProject?.description,
    projectIssuesLayout,
    cycleIssuesLayout,
    moduleIssuesLayout,
    projectViewIssuesLayout,
  ]);
};
