/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useCallback, useMemo } from "react";
// plane imports
import { DocumentEditorWithRef } from "@plane/editor";
import type {
  IEditorPropsExtended,
  EditorRefApi,
  IDocumentEditorProps,
  TExtensions,
  TFileHandler,
} from "@plane/editor";
import type { MakeOptional, TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useEditorConfig, useEditorMention } from "@/hooks/editor";
import { useMember } from "@/hooks/store/use-member";
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
import { useEditorFlagging } from "@/hooks/use-editor-flagging";
// local imports
import { EditorMentionsRoot } from "../embeds/mentions";

type DocumentEditorWrapperProps = MakeOptional<
  Omit<IDocumentEditorProps, "fileHandler" | "mentionHandler" | "user" | "extendedEditorProps">,
  "disabledExtensions" | "editable" | "flaggedExtensions" | "getEditorMetaData"
> & {
  extendedEditorProps?: Partial<IEditorPropsExtended>;
  workspaceSlug: string;
  workspaceId: string;
  projectId?: string;
} & (
    | {
        editable: false;
      }
    | {
        editable: true;
        searchMentionCallback: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
        uploadFile: TFileHandler["upload"];
        duplicateFile: TFileHandler["duplicate"];
      }
  );

export const DocumentEditor = forwardRef(function DocumentEditor(
  props: DocumentEditorWrapperProps,
  ref: React.ForwardedRef<EditorRefApi>
) {
  const {
    containerClassName,
    editable,
    extendedEditorProps,
    workspaceSlug,
    workspaceId,
    projectId,
    disabledExtensions: additionalDisabledExtensions = EMPTY_DISABLED_EXTENSIONS,
    ...rest
  } = props;
  // store hooks
  const { getUserDetails } = useMember();
  // parse content
  const { getEditorMetaData } = useParseEditorContent({
    projectId,
    workspaceSlug,
  });
  // editor flaggings
  const { document: documentEditorExtensions } = useEditorFlagging({
    workspaceSlug,
    projectId,
  });
  const searchMentionCallback = "searchMentionCallback" in props ? props.searchMentionCallback : NOOP_SEARCH_ENTITY;
  const searchEntity = useCallback(
    async (payload: TSearchEntityRequestPayload) => await searchMentionCallback(payload),
    [searchMentionCallback]
  );
  // use editor mention
  const { fetchMentions } = useEditorMention({
    enableAdvancedMentions: true,
    searchEntity,
  });
  // editor config
  const { getEditorFileHandlers } = useEditorConfig();
  const uploadFile = "uploadFile" in props ? props.uploadFile : NOOP_FILE_UPLOAD;
  const duplicateFile = "duplicateFile" in props ? props.duplicateFile : NOOP_FILE_DUPLICATE;

  const disabledExtensions = useMemo(
    () => [...documentEditorExtensions.disabled, ...(additionalDisabledExtensions ?? [])],
    [additionalDisabledExtensions, documentEditorExtensions.disabled]
  );

  const fileHandler = useMemo(
    () =>
      getEditorFileHandlers({
        projectId,
        uploadFile,
        duplicateFile,
        workspaceId,
        workspaceSlug,
      }),
    [duplicateFile, getEditorFileHandlers, projectId, uploadFile, workspaceId, workspaceSlug]
  );

  const mentionHandler = useMemo(
    () => ({
      searchCallback: async (query: string) => {
        const res = await fetchMentions(query);
        if (!res) throw new Error("Failed in fetching mentions");
        return res;
      },
      renderComponent: EditorMentionsRoot,
      getMentionedEntityDetails: (id: string) => ({ display_name: getUserDetails(id)?.display_name ?? "" }),
    }),
    [fetchMentions, getUserDetails]
  );

  return (
    <DocumentEditorWithRef
      ref={ref}
      disabledExtensions={disabledExtensions}
      editable={editable}
      flaggedExtensions={documentEditorExtensions.flagged}
      fileHandler={fileHandler}
      getEditorMetaData={getEditorMetaData}
      mentionHandler={mentionHandler}
      extendedEditorProps={extendedEditorProps ?? EMPTY_EXTENDED_EDITOR_PROPS}
      {...rest}
      containerClassName={cn("relative pb-3 pl-3", containerClassName)}
    />
  );
});

DocumentEditor.displayName = "DocumentEditor";

const EMPTY_EXTENDED_EDITOR_PROPS = {};
const EMPTY_DISABLED_EXTENSIONS: TExtensions[] = [];
const NOOP_FILE_UPLOAD: TFileHandler["upload"] = async () => "";
const NOOP_FILE_DUPLICATE: TFileHandler["duplicate"] = async () => "";
const NOOP_SEARCH_ENTITY = async () => ({});
