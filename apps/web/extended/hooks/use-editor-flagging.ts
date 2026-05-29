// editor
import type { TExtensions } from "@plane/editor";
import type { EPageStoreType } from "@/plane-web/hooks/store";

export type TEditorFlaggingHookReturnType = {
  document: {
    disabled: TExtensions[];
    flagged: TExtensions[];
  };
  liteText: {
    disabled: TExtensions[];
    flagged: TExtensions[];
  };
  richText: {
    disabled: TExtensions[];
    flagged: TExtensions[];
  };
};

export type TEditorFlaggingHookProps = {
  workspaceSlug: string;
  projectId?: string;
  storeType?: EPageStoreType;
};

const DISABLED_EXTENSIONS: TExtensions[] = ["ai", "collaboration-cursor"];

const EDITOR_FLAGGING_CONFIG: TEditorFlaggingHookReturnType = {
  document: {
    disabled: DISABLED_EXTENSIONS,
    flagged: [],
  },
  liteText: {
    disabled: DISABLED_EXTENSIONS,
    flagged: [],
  },
  richText: {
    disabled: DISABLED_EXTENSIONS,
    flagged: [],
  },
};

/**
 * @description extensions disabled in various editors
 */
export const useEditorFlagging = (_props: TEditorFlaggingHookProps): TEditorFlaggingHookReturnType =>
  EDITOR_FLAGGING_CONFIG;
