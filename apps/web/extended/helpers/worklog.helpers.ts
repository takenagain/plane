/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Format a duration in minutes to "Xh Ym" display string.
 * Examples: 150 → "2h 30m", 45 → "0h 45m", 0 → "0h 0m"
 */
export function formatDuration(totalMinutes: number): string {
    if (typeof totalMinutes !== "number" || !isFinite(totalMinutes) || totalMinutes < 0) return "0h 0m";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

/**
 * Parse hours and minutes inputs into total minutes.
 * Returns NaN if inputs are invalid.
 */
export function parseDuration(hours: number, minutes: number): number {
    if (
        typeof hours !== "number" ||
        typeof minutes !== "number" ||
        !isFinite(hours) ||
        !isFinite(minutes) ||
        hours < 0 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return NaN;
    }
    return hours * 60 + minutes;
}
