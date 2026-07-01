import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Card, ECardDirection, ECardSpacing, Loader } from "@plane/ui";
import { ProfileTimeAnalyticsService } from "@/services/profile-time-analytics.service";
import type { TProfileTimeFilters } from "./types";
import { filtersToQueryParams } from "./types";

const profileTimeAnalyticsService = new ProfileTimeAnalyticsService();

type Props = {
  userId: string;
  filters: TProfileTimeFilters;
};

export const ProfileTimeRecentWorklogs = observer(function ProfileTimeRecentWorklogs({ userId, filters }: Props) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const query = filtersToQueryParams(filters);

  const { data, isLoading } = useSWR(`profile-time-worklogs-${slug}-${userId}-${filters.dateFilter}`, () =>
    profileTimeAnalyticsService.getWorklogs(slug, userId, { ...query, per_page: 10 })
  );

  return (
    <Card direction={ECardDirection.COLUMN} spacing={ECardSpacing.SM}>
      <h3 className="text-14 font-medium">{t("profile.time_analytics.recent_worklogs")}</h3>
      {isLoading ? (
        <Loader className="space-y-2">
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : (
        <ul className="space-y-3">
          {(data?.results ?? []).map((wl) => (
            <li key={wl.id} className="border-b border-subtle pb-2 text-13 last:border-0">
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  {wl.issue.identifier ? `${wl.issue.identifier} · ` : ""}
                  {wl.issue.name}
                </span>
                <span className="text-secondary">
                  {wl.duration > 0 ? `${wl.duration}m` : t("profile.time_analytics.active")}
                </span>
              </div>
              {wl.description && <p className="mt-1 line-clamp-2 text-tertiary">{wl.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
