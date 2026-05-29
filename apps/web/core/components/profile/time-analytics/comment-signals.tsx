import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Card, ECardDirection, ECardSpacing, Loader } from "@plane/ui";
import { ProfileTimeAnalyticsService } from "@/services/profile-time-analytics.service";
import type { TProfileTimeFilters } from "./types";
import { filtersToQueryParams } from "./types";

const profileTimeAnalyticsService = new ProfileTimeAnalyticsService();

type Props = {
  workspaceSlug: string;
  userId: string;
  filters: TProfileTimeFilters;
};

export const ProfileTimeCommentSignals = observer(function ProfileTimeCommentSignals({
  workspaceSlug,
  userId,
  filters,
}: Props) {
  const { t } = useTranslation();
  const query = filtersToQueryParams(filters);

  const { data, isLoading } = useSWR(`profile-time-signals-${workspaceSlug}-${userId}-${filters.dateFilter}`, () =>
    profileTimeAnalyticsService.getCommentSignals(workspaceSlug, userId, query)
  );

  return (
    <Card direction={ECardDirection.COLUMN} spacing={ECardSpacing.SM}>
      <h3 className="text-14 font-medium">{t("profile.time_analytics.comment_signals")}</h3>
      <p className="text-caption-sm-regular text-tertiary">{t("profile.time_analytics.comment_signals_hint")}</p>
      {isLoading ? (
        <Loader className="space-y-2">
          <Loader.Item height="48px" />
        </Loader>
      ) : (
        <ul className="space-y-3">
          {(data?.results ?? []).map((signal) => (
            <li
              key={`${signal.issue_id}-${signal.comment_created_at}`}
              className="rounded-md border border-subtle p-3 text-13"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{signal.issue_name}</span>
                {signal.matched_keywords.length > 0 && (
                  <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 text-caption-sm-medium">
                    {t("profile.time_analytics.attention")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-tertiary">{signal.comment_excerpt}</p>
              <p className="mt-1 text-caption-sm-regular text-placeholder">
                {signal.comment_actor_name} · {signal.project_name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
