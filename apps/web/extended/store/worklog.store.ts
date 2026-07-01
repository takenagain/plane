import { action, makeObservable, observable, runInAction } from "mobx";
import type { IActiveWorklog, IWorklog, IWorklogCreatePayload, IWorklogUpdatePayload } from "@plane/types";
import { WorklogService } from "@plane/services";

const worklogService = new WorklogService();

type TStartTrackingOptions = {
  issueName?: string;
};

export type TCurrentWorklogTarget = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueName?: string;
  afterTrackingChange?: () => Promise<void> | void;
};

export interface IWorklogStore {
  // observables
  worklogsByIssue: Record<string, IWorklog[]>;
  totalByIssue: Record<string, number>;
  activeWorklog: IActiveWorklog | null;
  currentWorklogTarget: TCurrentWorklogTarget | null;
  activeWorklogError: string | null;
  isBootstrappingActiveWorklog: boolean;
  hasBootstrappedActiveWorklog: boolean;
  isLoading: boolean;

  // actions
  fetchWorklogs: (workspaceSlug: string, projectId: string, issueId: string) => Promise<IWorklog[]>;

  fetchTotal: (workspaceSlug: string, projectId: string, issueId: string) => Promise<number>;

  fetchActiveWorklog: (workspaceSlug: string) => Promise<IActiveWorklog | null>;

  clearActiveWorklog: () => void;

  setCurrentWorklogTarget: (target: TCurrentWorklogTarget | null) => void;

  createWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: IWorklogCreatePayload
  ) => Promise<IWorklog>;

  startTracking: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    options?: TStartTrackingOptions
  ) => Promise<IWorklog>;

  stopTracking: (workspaceSlug: string, projectId: string, issueId: string) => Promise<IWorklog>;

  updateWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: IWorklogUpdatePayload
  ) => Promise<IWorklog>;

  deleteWorklog: (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => Promise<void>;
}

export class WorklogStore implements IWorklogStore {
  worklogsByIssue: Record<string, IWorklog[]> = {};
  totalByIssue: Record<string, number> = {};
  activeWorklog: IActiveWorklog | null = null;
  currentWorklogTarget: TCurrentWorklogTarget | null = null;
  activeWorklogError: string | null = null;
  isBootstrappingActiveWorklog = false;
  hasBootstrappedActiveWorklog = false;
  isLoading = false;
  private activeWorklogBootstrapRequestId = 0;
  private activeWorklogMutationId = 0;

  constructor() {
    makeObservable(this, {
      worklogsByIssue: observable,
      totalByIssue: observable,
      activeWorklog: observable,
      currentWorklogTarget: observable.ref,
      activeWorklogError: observable,
      isBootstrappingActiveWorklog: observable,
      hasBootstrappedActiveWorklog: observable,
      isLoading: observable,
      fetchWorklogs: action,
      fetchTotal: action,
      fetchActiveWorklog: action,
      clearActiveWorklog: action,
      setCurrentWorklogTarget: action,
      createWorklog: action,
      startTracking: action,
      stopTracking: action,
      updateWorklog: action,
      deleteWorklog: action,
    });
  }

  private upsertIssueWorklog(issueId: string, worklog: IWorklog) {
    const existing = this.worklogsByIssue[issueId] ?? [];
    const existingIndex = existing.findIndex((candidate) => candidate.id === worklog.id);

    if (existingIndex !== -1) {
      existing[existingIndex] = worklog;
      this.worklogsByIssue[issueId] = [...existing];
      return;
    }

    this.worklogsByIssue[issueId] = [worklog, ...existing];
  }

  private toActiveWorklog(worklog: IWorklog, workspaceSlug: string, issueName?: string): IActiveWorklog {
    return {
      ...worklog,
      issue_name: issueName ?? (this.activeWorklog?.issue === worklog.issue ? this.activeWorklog.issue_name : "") ?? "",
      workspace_slug: workspaceSlug,
    };
  }

  fetchWorklogs = async (workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklog[]> => {
    this.isLoading = true;
    try {
      const worklogs = await worklogService.list(workspaceSlug, projectId, issueId);
      runInAction(() => {
        this.worklogsByIssue[issueId] = worklogs;
        this.isLoading = false;
      });
      return worklogs;
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      throw error;
    }
  };

  fetchTotal = async (workspaceSlug: string, projectId: string, issueId: string): Promise<number> => {
    const response = await worklogService.getTotal(workspaceSlug, projectId, issueId);
    runInAction(() => {
      this.totalByIssue[issueId] = response.total_duration;
    });
    return response.total_duration;
  };

  fetchActiveWorklog = async (workspaceSlug: string): Promise<IActiveWorklog | null> => {
    const requestId = ++this.activeWorklogBootstrapRequestId;
    const mutationIdAtRequestStart = this.activeWorklogMutationId;
    const isStaleRequest = () =>
      requestId !== this.activeWorklogBootstrapRequestId || mutationIdAtRequestStart !== this.activeWorklogMutationId;
    this.isBootstrappingActiveWorklog = true;
    this.activeWorklogError = null;

    try {
      const activeWorklog = await worklogService.getActive(workspaceSlug);
      runInAction(() => {
        this.hasBootstrappedActiveWorklog = true;
        this.isBootstrappingActiveWorklog = false;
        if (isStaleRequest()) {
          return;
        }

        this.activeWorklog = activeWorklog;
      });
      return activeWorklog;
    } catch (error) {
      const staleRequest = isStaleRequest();
      runInAction(() => {
        this.hasBootstrappedActiveWorklog = true;
        this.isBootstrappingActiveWorklog = false;
        if (staleRequest) {
          return;
        }

        this.activeWorklog = null;
        this.activeWorklogError = "Failed to restore the active timer.";
      });
      if (staleRequest) {
        return this.activeWorklog;
      }
      throw error;
    }
  };

  clearActiveWorklog = () => {
    this.activeWorklogMutationId += 1;
    this.activeWorklog = null;
    this.activeWorklogError = null;
  };

  setCurrentWorklogTarget = (target: TCurrentWorklogTarget | null) => {
    this.currentWorklogTarget = target;
  };

  createWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: IWorklogCreatePayload
  ): Promise<IWorklog> => {
    const worklog = await worklogService.create(workspaceSlug, projectId, issueId, data);
    runInAction(() => {
      const existing = this.worklogsByIssue[issueId] ?? [];
      this.worklogsByIssue[issueId] = [worklog, ...existing];
      // Update total optimistically
      this.totalByIssue[issueId] = (this.totalByIssue[issueId] ?? 0) + worklog.duration;
    });
    return worklog;
  };

  startTracking = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    options?: TStartTrackingOptions
  ): Promise<IWorklog> => {
    const worklog = await worklogService.startTracking(workspaceSlug, projectId, issueId);
    runInAction(() => {
      this.activeWorklogMutationId += 1;
      this.upsertIssueWorklog(issueId, worklog);
      this.activeWorklog = this.toActiveWorklog(worklog, workspaceSlug, options?.issueName);
      this.activeWorklogError = null;
    });
    await this.fetchTotal(workspaceSlug, projectId, issueId);
    return worklog;
  };

  stopTracking = async (workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklog> => {
    const updated = await worklogService.stopTracking(workspaceSlug, projectId, issueId);
    runInAction(() => {
      this.activeWorklogMutationId += 1;
      this.upsertIssueWorklog(issueId, updated);

      if (this.activeWorklog?.id === updated.id) {
        this.activeWorklog = null;
      }
    });
    await this.fetchTotal(workspaceSlug, projectId, issueId);
    return updated;
  };

  updateWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: IWorklogUpdatePayload
  ): Promise<IWorklog> => {
    const updated = await worklogService.update(workspaceSlug, projectId, issueId, worklogId, data);
    runInAction(() => {
      const existing = this.worklogsByIssue[issueId] ?? [];
      const idx = existing.findIndex((w) => w.id === worklogId);
      if (idx !== -1) {
        const oldDuration = existing[idx].duration;
        existing[idx] = updated;
        this.worklogsByIssue[issueId] = [...existing];
        // Update total: subtract old, add new
        this.totalByIssue[issueId] = (this.totalByIssue[issueId] ?? 0) - oldDuration + updated.duration;
      }
    });
    return updated;
  };

  deleteWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string
  ): Promise<void> => {
    // Capture duration before delete for optimistic total update
    const existing = this.worklogsByIssue[issueId] ?? [];
    const target = existing.find((w) => w.id === worklogId);
    const removedDuration = target?.duration ?? 0;

    await worklogService.remove(workspaceSlug, projectId, issueId, worklogId);
    runInAction(() => {
      this.worklogsByIssue[issueId] = existing.filter((w) => w.id !== worklogId);
      this.totalByIssue[issueId] = Math.max(0, (this.totalByIssue[issueId] ?? 0) - removedDuration);
    });
  };
}
