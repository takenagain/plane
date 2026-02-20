/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import type {
    IWorklog,
    IWorklogCreatePayload,
    IWorklogUpdatePayload,
} from "@plane/types";
import { WorklogService } from "@plane/services";

const worklogService = new WorklogService();

export interface IWorklogStore {
    // observables
    worklogsByIssue: Record<string, IWorklog[]>;
    totalByIssue: Record<string, number>;
    isLoading: boolean;

    // actions
    fetchWorklogs: (
        workspaceSlug: string,
        projectId: string,
        issueId: string
    ) => Promise<IWorklog[]>;

    fetchTotal: (
        workspaceSlug: string,
        projectId: string,
        issueId: string
    ) => Promise<number>;

    createWorklog: (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        data: IWorklogCreatePayload
    ) => Promise<IWorklog>;

    updateWorklog: (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        worklogId: string,
        data: IWorklogUpdatePayload
    ) => Promise<IWorklog>;

    deleteWorklog: (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        worklogId: string
    ) => Promise<void>;
}

export class WorklogStore implements IWorklogStore {
    worklogsByIssue: Record<string, IWorklog[]> = {};
    totalByIssue: Record<string, number> = {};
    isLoading = false;

    constructor() {
        makeObservable(this, {
            worklogsByIssue: observable,
            totalByIssue: observable,
            isLoading: observable,
            fetchWorklogs: action,
            fetchTotal: action,
            createWorklog: action,
            updateWorklog: action,
            deleteWorklog: action,
        });
    }

    fetchWorklogs = async (
        workspaceSlug: string,
        projectId: string,
        issueId: string
    ): Promise<IWorklog[]> => {
        this.isLoading = true;
        try {
            const worklogs = await worklogService.list(
                workspaceSlug,
                projectId,
                issueId
            );
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

    fetchTotal = async (
        workspaceSlug: string,
        projectId: string,
        issueId: string
    ): Promise<number> => {
        try {
            const response = await worklogService.getTotal(
                workspaceSlug,
                projectId,
                issueId
            );
            runInAction(() => {
                this.totalByIssue[issueId] = response.total_duration;
            });
            return response.total_duration;
        } catch (error) {
            throw error;
        }
    };

    createWorklog = async (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        data: IWorklogCreatePayload
    ): Promise<IWorklog> => {
        try {
            const worklog = await worklogService.create(
                workspaceSlug,
                projectId,
                issueId,
                data
            );
            runInAction(() => {
                const existing = this.worklogsByIssue[issueId] ?? [];
                this.worklogsByIssue[issueId] = [worklog, ...existing];
                // Update total optimistically
                this.totalByIssue[issueId] =
                    (this.totalByIssue[issueId] ?? 0) + worklog.duration;
            });
            return worklog;
        } catch (error) {
            throw error;
        }
    };

    updateWorklog = async (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        worklogId: string,
        data: IWorklogUpdatePayload
    ): Promise<IWorklog> => {
        try {
            const updated = await worklogService.update(
                workspaceSlug,
                projectId,
                issueId,
                worklogId,
                data
            );
            runInAction(() => {
                const existing = this.worklogsByIssue[issueId] ?? [];
                const idx = existing.findIndex((w) => w.id === worklogId);
                if (idx !== -1) {
                    const oldDuration = existing[idx].duration;
                    existing[idx] = updated;
                    this.worklogsByIssue[issueId] = [...existing];
                    // Update total: subtract old, add new
                    this.totalByIssue[issueId] =
                        (this.totalByIssue[issueId] ?? 0) -
                        oldDuration +
                        updated.duration;
                }
            });
            return updated;
        } catch (error) {
            throw error;
        }
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

        try {
            await worklogService.remove(
                workspaceSlug,
                projectId,
                issueId,
                worklogId
            );
            runInAction(() => {
                this.worklogsByIssue[issueId] = existing.filter(
                    (w) => w.id !== worklogId
                );
                this.totalByIssue[issueId] = Math.max(
                    0,
                    (this.totalByIssue[issueId] ?? 0) - removedDuration
                );
            });
        } catch (error) {
            throw error;
        }
    };
}
