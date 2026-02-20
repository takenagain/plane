/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TActivityFilters, TActivityFilterOption } from "@plane/constants";
import { ACTIVITY_FILTER_TYPE_OPTIONS } from "@plane/constants";
// components
import { ActivityFilter } from "@/components/issues/issue-detail/issue-activity";

export type TActivityFilterRoot = {
    selectedFilters: TActivityFilters[];
    toggleFilter: (filter: TActivityFilters) => void;
    projectId: string;
    isIntakeIssue?: boolean;
};

// Worklog filter key — matches the activity_type "WORKLOG" used in TIssueActivityComment
const WORKLOG_FILTER_KEY = "WORKLOG" as TActivityFilters;

export function ActivityFilterRoot(props: TActivityFilterRoot) {
    const { selectedFilters, toggleFilter } = props;

    // Build filters from the base constant options
    const filters: TActivityFilterOption[] = Object.entries(ACTIVITY_FILTER_TYPE_OPTIONS).map(([key, value]) => {
        const filterKey = key as TActivityFilters;
        return {
            key: filterKey,
            labelTranslationKey: value.labelTranslationKey,
            isSelected: selectedFilters.includes(filterKey),
            onClick: () => toggleFilter(filterKey),
        };
    });

    // Append the worklog filter option (not present in the base CE constants)
    filters.push({
        key: WORKLOG_FILTER_KEY,
        labelTranslationKey: "common.time_logged",
        isSelected: selectedFilters.includes(WORKLOG_FILTER_KEY),
        onClick: () => toggleFilter(WORKLOG_FILTER_KEY),
    });

    return <ActivityFilter selectedFilters={selectedFilters} filterOptions={filters} />;
}
