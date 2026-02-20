/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Core worklog interface matching the backend Worklog model serialization.
 */
export interface IWorklog {
    id: string;
    issue: string;
    actor: string;
    description: string;
    duration: number; // minutes
    logged_at: string; // ISO date string "YYYY-MM-DD"
    project: string;
    workspace: string;
    created_at: string; // ISO datetime
    updated_at: string; // ISO datetime
    created_by: string;
}

/**
 * Payload for creating a new worklog.
 */
export interface IWorklogCreatePayload {
    description?: string;
    duration: number; // minutes
    logged_at?: string; // defaults to today on backend
}

/**
 * Payload for updating an existing worklog.
 */
export interface IWorklogUpdatePayload {
    description?: string;
    duration?: number;
    logged_at?: string;
}

/**
 * Response from the total duration aggregation endpoint.
 */
export interface IWorklogTotalResponse {
    total_duration: number; // total minutes
}
