import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// plane web hooks (extended)
import type { EPageStoreType } from "./use-page-store";
import { usePageStore } from "./use-page-store";

export type TArgs = {
  pageId: string;
  storeType: EPageStoreType;
};

export const usePage = (args: TArgs) => {
  const { pageId, storeType } = args;
  // context
  const context = useContext(StoreContext);
  // store hooks
  const pageStore = usePageStore(storeType);

  if (context === undefined) throw new Error("usePage must be used within StoreProvider");
  if (!pageId) return undefined;

  return pageStore.getPageById(pageId);
};
