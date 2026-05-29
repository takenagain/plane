import { useContext } from "react";
import type { IActiveWorklog, IWorklog } from "@plane/types";
import { usePathname, useRouter } from "next/navigation";
import { StoreContext } from "@/lib/store-context";
import {
  formatElapsedDurationCompact,
  formatElapsedDurationFull,
  getElapsedSeconds,
} from "@/plane-web/helpers/worklog.helpers";
import type { TCurrentWorklogTarget } from "@/plane-web/store/worklog.store";

type TTrackingChangeCallback = (() => Promise<void> | void) | undefined;

type TStartTrackingParams = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueName?: string;
  afterTrackingChange?: TTrackingChangeCallback;
};

type TStopTrackingParams = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  afterTrackingChange?: TTrackingChangeCallback;
};

export const useActiveWorklogController = () => {
  const context = useContext(StoreContext);
  const pathname = usePathname();
  const router = useRouter();

  if (context === undefined) throw new Error("useActiveWorklogController must be used within StoreProvider");

  const { worklogStore } = context;

  const bootstrapActiveTracking = (workspaceSlug: string) => worklogStore.fetchActiveWorklog(workspaceSlug);

  const startTracking = async (params: TStartTrackingParams): Promise<IWorklog> => {
    const { workspaceSlug, projectId, issueId, issueName, afterTrackingChange } = params;
    const worklog = await worklogStore.startTracking(workspaceSlug, projectId, issueId, { issueName });
    await afterTrackingChange?.();
    return worklog;
  };

  const stopTracking = async (params: TStopTrackingParams): Promise<IWorklog> => {
    const { workspaceSlug, projectId, issueId, afterTrackingChange } = params;
    const worklog = await worklogStore.stopTracking(workspaceSlug, projectId, issueId);
    await afterTrackingChange?.();
    return worklog;
  };

  const openTrackedWorkItem = (
    target: IActiveWorklog | TCurrentWorklogTarget | null = worklogStore.activeWorklog ??
      worklogStore.currentWorklogTarget
  ) => {
    if (!target) return;

    const targetPath =
      "workspace_slug" in target
        ? `/${target.workspace_slug}/projects/${target.project}/issues/${target.issue}`
        : `/${target.workspaceSlug}/projects/${target.projectId}/issues/${target.issueId}`;
    const normalizedPathname = pathname.replace(/\/+$/, "");
    const normalizedTargetPath = targetPath.replace(/\/+$/, "");

    if (normalizedPathname === normalizedTargetPath) return;

    router.push(targetPath);
  };

  const getActiveDurationSeconds = (
    activeWorklog: IActiveWorklog | null = worklogStore.activeWorklog,
    nowMs = Date.now()
  ): number => {
    if (!activeWorklog) return 0;
    return getElapsedSeconds(activeWorklog.created_at, nowMs);
  };

  const resolveActiveWorklog = (activeWorklog?: IActiveWorklog | null) =>
    activeWorklog === undefined ? worklogStore.activeWorklog : activeWorklog;

  return {
    activeWorklog: worklogStore.activeWorklog,
    activeWorklogError: worklogStore.activeWorklogError,
    hasBootstrappedActiveWorklog: worklogStore.hasBootstrappedActiveWorklog,
    isBootstrappingActiveWorklog: worklogStore.isBootstrappingActiveWorklog,
    bootstrapActiveTracking,
    clearActiveWorklog: worklogStore.clearActiveWorklog,
    startTracking,
    stopTracking,
    openTrackedWorkItem,
    getActiveDurationSeconds,
    formatActiveDurationCompact: (activeWorklog?: IActiveWorklog | null, nowMs?: number) =>
      formatElapsedDurationCompact(getActiveDurationSeconds(resolveActiveWorklog(activeWorklog), nowMs)),
    formatActiveDurationFull: (activeWorklog?: IActiveWorklog | null, nowMs?: number) =>
      formatElapsedDurationFull(getActiveDurationSeconds(resolveActiveWorklog(activeWorklog), nowMs)),
  };
};
