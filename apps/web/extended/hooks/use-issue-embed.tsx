// editor
import type { TEmbedConfig } from "@plane/editor";
// plane types
import type { TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";

export type TIssueEmbedHookProps = {
  fetchEmbedSuggestions?: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  projectId?: string;
  workspaceSlug?: string;
};

export const useIssueEmbed = (_props: TIssueEmbedHookProps) => ({
  issueEmbedProps: {} as TEmbedConfig["issue"],
});
