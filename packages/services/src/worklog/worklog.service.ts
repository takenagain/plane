/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IWorklog, IWorklogCreatePayload, IWorklogUpdatePayload, IWorklogTotalResponse } from "@plane/types";
import { APIService } from "../api.service";

/**
 * Service for managing issue worklogs (time tracking).
 */
export class WorklogService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  private basePath(workspaceSlug: string, projectId: string, issueId: string): string {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
  }

  /**
   * Create a new worklog for an issue.
   * @param {string} workspaceSlug - The workspace identifier
   * @param {string} projectId - The project identifier
   * @param {string} issueId - The issue identifier
   * @param {IWorklogCreatePayload} data - The worklog creation payload
   * @returns {Promise<IWorklog>} The created worklog
   */
  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: IWorklogCreatePayload
  ): Promise<IWorklog> {
    return this.post(this.basePath(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Start an active worklog timer for an issue.
   */
  async startTracking(workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklog> {
    return this.post(`${this.basePath(workspaceSlug, projectId, issueId)}start/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Stop the active worklog timer for an issue.
   */
  async stopTracking(workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklog> {
    return this.post(`${this.basePath(workspaceSlug, projectId, issueId)}stop/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * List all worklogs for an issue.
   * @param {string} workspaceSlug - The workspace identifier
   * @param {string} projectId - The project identifier
   * @param {string} issueId - The issue identifier
   * @returns {Promise<IWorklog[]>} Array of worklogs for the issue
   */
  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklog[]> {
    return this.get(this.basePath(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Get total duration logged for an issue.
   * @param {string} workspaceSlug - The workspace identifier
   * @param {string} projectId - The project identifier
   * @param {string} issueId - The issue identifier
   * @returns {Promise<IWorklogTotalResponse>} The total duration response
   */
  async getTotal(workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklogTotalResponse> {
    return this.get(`${this.basePath(workspaceSlug, projectId, issueId)}total/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Update an existing worklog.
   * @param {string} workspaceSlug - The workspace identifier
   * @param {string} projectId - The project identifier
   * @param {string} issueId - The issue identifier
   * @param {string} worklogId - The worklog identifier
   * @param {IWorklogUpdatePayload} data - The worklog update payload
   * @returns {Promise<IWorklog>} The updated worklog
   */
  async update(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: IWorklogUpdatePayload
  ): Promise<IWorklog> {
    return this.patch(`${this.basePath(workspaceSlug, projectId, issueId)}${worklogId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Delete a worklog.
   * @param {string} workspaceSlug - The workspace identifier
   * @param {string} projectId - The project identifier
   * @param {string} issueId - The issue identifier
   * @param {string} worklogId - The worklog identifier
   * @returns {Promise<void>}
   */
  async remove(workspaceSlug: string, projectId: string, issueId: string, worklogId: string): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId, issueId)}${worklogId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
