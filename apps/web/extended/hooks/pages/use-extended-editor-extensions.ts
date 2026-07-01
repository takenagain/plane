import type { IEditorPropsExtended } from "@plane/editor";
import type { TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
import type { TPageInstance } from "@/store/pages/base-page";
import type { EPageStoreType } from "../store";

export type TExtendedEditorExtensionsHookParams = {
  workspaceSlug: string;
  page: TPageInstance;
  storeType: EPageStoreType;
  fetchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  getRedirectionLink: (pageId?: string) => string;
  extensionHandlers?: Map<string, unknown>;
  projectId?: string;
};

export type TExtendedEditorExtensionsConfig = IEditorPropsExtended;

// A single frozen, module-level instance so the reference is STABLE across renders.
// `extendedEditorProps` is a dependency of the editor's `resolvedExtensions` memo
// (see use-editor.ts / use-collaborative-editor.ts). @tiptap/react's `useEditor`
// destroys and recreates the editor whenever its deps array changes identity, so
// returning a fresh `{}` each render tore down the ProseMirror view on every render
// — the cursor vanished and the bubble menu fired `onShow` on a destroyed editor
// (`editor.commands` → null commandManager). Returning a stable reference fixes it.
const EXTENDED_EDITOR_PROPS: TExtendedEditorExtensionsConfig = Object.freeze({});

export const useExtendedEditorProps = (_params: TExtendedEditorExtensionsHookParams): TExtendedEditorExtensionsConfig =>
  EXTENDED_EDITOR_PROPS;
