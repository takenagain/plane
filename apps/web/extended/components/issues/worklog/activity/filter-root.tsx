import { useEffect, useRef } from "react";
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
  const hasAutoEnabled = useRef(false);

  // Auto-enable the WORKLOG filter if it isn\'t already in the stored selection.
  // This ensures worklog activities are visible by default for users who had their
  // filter preferences saved before the worklog feature was introduced.
  // The toggleFilter call persists the change to localStorage so it only fires once.
  useEffect(() => {
    if (!hasAutoEnabled.current && !selectedFilters.includes(WORKLOG_FILTER_KEY)) {
      hasAutoEnabled.current = true;
      toggleFilter(WORKLOG_FILTER_KEY);
    }
  }, [selectedFilters, toggleFilter]);

  // Include WORKLOG in the effective selected filters for the UI even before
  // the effect persists it, so the checkbox renders checked immediately.
  const effectiveSelectedFilters = selectedFilters.includes(WORKLOG_FILTER_KEY)
    ? selectedFilters
    : [...selectedFilters, WORKLOG_FILTER_KEY];

  // Build filters from the base constant options
  const filters: TActivityFilterOption[] = Object.entries(ACTIVITY_FILTER_TYPE_OPTIONS).map(([key, value]) => {
    const filterKey = key as TActivityFilters;
    return {
      key: filterKey,
      labelTranslationKey: value.labelTranslationKey,
      isSelected: effectiveSelectedFilters.includes(filterKey),
      onClick: () => toggleFilter(filterKey),
    };
  });

  // Append the worklog filter option (not present in the base CE constants)
  filters.push({
    key: WORKLOG_FILTER_KEY,
    labelTranslationKey: "common.time_logged",
    isSelected: effectiveSelectedFilters.includes(WORKLOG_FILTER_KEY),
    onClick: () => toggleFilter(WORKLOG_FILTER_KEY),
  });

  return <ActivityFilter selectedFilters={effectiveSelectedFilters} filterOptions={filters} />;
}
