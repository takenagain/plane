/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useCallback, useMemo } from "react";
// plane imports
import { RichTextEditorWithRef } from "@plane/editor";
import type { EditorRefApi, IRichTextEditorProps, TExtensions, TFileHandler } from "@plane/editor";
import type { MakeOptional, TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { EditorMentionsRoot } from "@/components/editor/embeds/mentions";
// hooks
import { useEditorConfig, useEditorMention } from "@/hooks/editor";
import { useMember } from "@/hooks/store/use-member";
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
// plane web hooks
import { useEditorFlagging } from "@/plane-web/hooks/use-editor-flagging";

type RichTextEditorWrapperProps = MakeOptional<
  Omit<IRichTextEditorProps, "fileHandler" | "mentionHandler" | "extendedEditorProps">,
  "disabledExtensions" | "editable" | "flaggedExtensions" | "getEditorMetaData"
> & {
  workspaceSlug: string;
  workspaceId: string;
  projectId?: string;
  issueSequenceId?: number;
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

export const RichTextEditor = forwardRef(function RichTextEditor(
  props: RichTextEditorWrapperProps,
  ref: React.ForwardedRef<EditorRefApi>
) {
  const {
    containerClassName,
    editable,
    workspaceSlug,
    workspaceId,
    projectId,
    disabledExtensions: additionalDisabledExtensions = EMPTY_DISABLED_EXTENSIONS,
    ...rest
  } = props;
  // store hooks
  const { getUserDetails } = useMember();
  // editor flaggings
  const { richText: richTextEditorExtensions } = useEditorFlagging({
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
    searchEntity,
  });
  // editor config
  const { getEditorFileHandlers } = useEditorConfig();
  // parse content
  const { getEditorMetaData } = useParseEditorContent({
    projectId,
    workspaceSlug,
  });
  const uploadFile = "uploadFile" in props ? props.uploadFile : NOOP_FILE_UPLOAD;
  const duplicateFile = "duplicateFile" in props ? props.duplicateFile : NOOP_FILE_DUPLICATE;

  const disabledExtensions = useMemo(
    () => [...richTextEditorExtensions.disabled, ...(additionalDisabledExtensions ?? [])],
    [additionalDisabledExtensions, richTextEditorExtensions.disabled]
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
      getMentionedEntityDetails: (id: string) => ({
        display_name: getUserDetails(id)?.display_name ?? "",
      }),
    }),
    [fetchMentions, getUserDetails]
  );

  return (
    <RichTextEditorWithRef
      ref={ref}
      disabledExtensions={disabledExtensions}
      editable={editable}
      flaggedExtensions={richTextEditorExtensions.flagged}
      fileHandler={fileHandler}
      getEditorMetaData={getEditorMetaData}
      mentionHandler={mentionHandler}
      extendedEditorProps={EMPTY_EXTENDED_EDITOR_PROPS}
      {...rest}
      containerClassName={cn("relative pb-3 pl-3", containerClassName)}
    />
  );
});

RichTextEditor.displayName = "RichTextEditor";

const EMPTY_EXTENDED_EDITOR_PROPS = {};
const EMPTY_DISABLED_EXTENSIONS: TExtensions[] = [];
const NOOP_FILE_UPLOAD: TFileHandler["upload"] = async () => "";
const NOOP_FILE_DUPLICATE: TFileHandler["duplicate"] = async () => "";
const NOOP_SEARCH_ENTITY = async () => ({});
