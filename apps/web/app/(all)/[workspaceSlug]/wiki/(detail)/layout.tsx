import { Outlet } from "react-router";
import useSWR from "swr";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
import type { Route } from "./+types/layout";
import { WikiPageDetailsHeader } from "./header";

export default function WikiPageDetailsLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { fetchPagesList } = usePageStore(EPageStoreType.WIKI);
  useSWR(`WIKI_PAGES_${workspaceSlug}`, () => fetchPagesList(workspaceSlug, ""));
  return (
    <>
      <AppHeader header={<WikiPageDetailsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
