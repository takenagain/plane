import { observer } from "mobx-react";
import { ANALYTICS_DURATION_FILTER_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CustomSearchSelect } from "@plane/ui";
import DurationDropdown from "@/components/analytics/select/duration";
import { useProject } from "@/hooks/store/use-project";
import type { TProfileTimeFilters } from "./types";

type Props = {
  filters: TProfileTimeFilters;
  onChange: (filters: TProfileTimeFilters) => void;
};

export const ProfileTimeFilters = observer(function ProfileTimeFilters({ filters, onChange }: Props) {
  const { t } = useTranslation();
  const { joinedProjectIds, getProjectById } = useProject();

  const projectOptions = joinedProjectIds.map((projectId) => {
    const project = getProjectById(projectId);
    return {
      value: projectId,
      query: project?.name ?? projectId,
      content: <span className="truncate">{project?.name ?? projectId}</span>,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="profile-time-filters">
      <DurationDropdown
        buttonVariant="border-with-text"
        value={filters.dateFilter}
        onChange={(dateFilter) => onChange({ ...filters, dateFilter })}
        placeholder={t("profile.time_analytics.filters.duration")}
      />
      {projectOptions.length > 0 && (
        <CustomSearchSelect
          multiple
          value={filters.projectIds}
          onChange={(projectIds: string[]) => onChange({ ...filters, projectIds })}
          options={projectOptions}
          label={
            <span className="text-13 text-secondary">
              {filters.projectIds.length > 0
                ? t("profile.time_analytics.filters.projects_count", { count: filters.projectIds.length })
                : t("profile.time_analytics.filters.all_projects")}
            </span>
          }
        />
      )}
    </div>
  );
});

export const DEFAULT_PROFILE_TIME_FILTERS: TProfileTimeFilters = {
  dateFilter: ANALYTICS_DURATION_FILTER_OPTIONS[1]?.value ?? "last_7_days",
  projectIds: [],
};
