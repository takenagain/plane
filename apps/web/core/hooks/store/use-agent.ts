import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { IAgentStore } from "@/store/agent";

export const useAgent = (): IAgentStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useAgent must be used within StoreProvider");
  return context.agent;
};
