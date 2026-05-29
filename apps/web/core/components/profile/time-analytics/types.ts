export type TProfileTimeFilters = {
  dateFilter: string;
  projectIds: string[];
};

export function filtersToQueryParams(filters: TProfileTimeFilters) {
  return {
    date_filter: filters.dateFilter,
    ...(filters.projectIds.length > 0 ? { project_ids: filters.projectIds.join(",") } : {}),
  };
}
