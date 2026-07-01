import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { WikiPagesListHeader } from "./header";

export default function WikiPagesListLayout() {
  return (
    <>
      <AppHeader header={<WikiPagesListHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
