/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo, useState } from "react";
// plane constants
import type { EIssueCommentAccessSpecifier } from "@plane/constants";
// plane imports
import { LiteTextEditorWithRef } from "@plane/editor";
import type { EditorRefApi, ILiteTextEditorProps, TExtensions, TFileHandler } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { MakeOptional, TSearchEntityRequestPayload } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
// components
import { EditorMentionsRoot } from "@/components/editor/embeds/mentions";
import { IssueCommentToolbar } from "@/components/editor/lite-text/toolbar";
// hooks
import { useEditorConfig, useEditorMention } from "@/hooks/editor";
import { useMember } from "@/hooks/store/use-member";
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
// plane web hooks
import { useEditorFlagging } from "@/plane-web/hooks/use-editor-flagging";
// plane web service
import { WorkspaceService } from "@/services/workspace.service";
import { LiteToolbar } from "./lite-toolbar";
const workspaceService = new WorkspaceService();

type LiteTextEditorWrapperProps = MakeOptional<
  Omit<ILiteTextEditorProps, "fileHandler" | "mentionHandler" | "extendedEditorProps">,
  "disabledExtensions" | "flaggedExtensions" | "getEditorMetaData"
> & {
  workspaceSlug: string;
  workspaceId: string;
  projectId?: string;
  accessSpecifier?: EIssueCommentAccessSpecifier;
  handleAccessChange?: (accessKey: EIssueCommentAccessSpecifier) => void;
  showAccessSpecifier?: boolean;
  showSubmitButton?: boolean;
  isSubmitting?: boolean;
  showToolbarInitially?: boolean;
  variant?: "full" | "lite" | "none";
  issue_id?: string;
  parentClassName?: string;
  editorClassName?: string;
  submitButtonText?: string;
} & (
    | {
        editable: false;
      }
    | {
        editable: true;
        uploadFile: TFileHandler["upload"];
        duplicateFile: TFileHandler["duplicate"];
      }
  );

function isMutableRefObject<T>(forwardedRef: React.ForwardedRef<T>): forwardedRef is React.MutableRefObject<T | null> {
  return !!forwardedRef && typeof forwardedRef === "object" && "current" in forwardedRef;
}

export const LiteTextEditor = React.forwardRef(function LiteTextEditor(
  props: LiteTextEditorWrapperProps,
  ref: React.ForwardedRef<EditorRefApi>
) {
  const { t } = useTranslation();
  const {
    containerClassName,
    editable,
    workspaceSlug,
    workspaceId,
    projectId,
    issue_id,
    accessSpecifier,
    handleAccessChange,
    showAccessSpecifier = false,
    showSubmitButton = true,
    isSubmitting = false,
    showToolbarInitially = true,
    variant = "full",
    parentClassName = "",
    placeholder = t("issue.comments.placeholder"),
    disabledExtensions: additionalDisabledExtensions = EMPTY_DISABLED_EXTENSIONS,
    editorClassName = "",
    showPlaceholderOnEmpty = true,
    submitButtonText = "common.comment",
    ...rest
  } = props;
  // states
  const isLiteVariant = variant === "lite";
  const isFullVariant = variant === "full";
  const [isFocused, setIsFocused] = useState(isFullVariant ? showToolbarInitially : true);
  const [editorRef, setEditorRef] = useState<EditorRefApi | null>(null);
  // editor flaggings
  const { liteText: liteTextEditorExtensions } = useEditorFlagging({
    workspaceSlug,
    projectId,
  });
  // store hooks
  const { getUserDetails } = useMember();
  // parse content
  const { getEditorMetaData } = useParseEditorContent({
    projectId,
    workspaceSlug,
  });
  const searchEntity = useCallback(
    async (payload: TSearchEntityRequestPayload) =>
      await workspaceService.searchEntity(workspaceSlug, {
        ...payload,
        project_id: projectId,
        issue_id,
      }),
    [issue_id, projectId, workspaceSlug]
  );
  // use editor mention
  const { fetchMentions } = useEditorMention({
    searchEntity,
  });
  // editor config
  const { getEditorFileHandlers } = useEditorConfig();
  const uploadFile = "uploadFile" in props ? props.uploadFile : NOOP_FILE_UPLOAD;
  const duplicateFile = "duplicateFile" in props ? props.duplicateFile : NOOP_FILE_DUPLICATE;
  // derived values
  const isEmpty = isCommentEmpty(props.initialValue);
  const disabledExtensions = useMemo(
    () => [...liteTextEditorExtensions.disabled, ...additionalDisabledExtensions],
    [additionalDisabledExtensions, liteTextEditorExtensions.disabled]
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
    <div
      className={cn(
        "relative rounded-sm border border-subtle",
        {
          "p-3": editable && !isLiteVariant,
        },
        parentClassName
      )}
      onFocus={() => isFullVariant && !showToolbarInitially && setIsFocused(true)}
      onBlur={() => isFullVariant && !showToolbarInitially && setIsFocused(false)}
    >
      {/* Wrapper for lite toolbar layout */}
      <div className={cn(isLiteVariant && editable ? "flex items-end gap-1" : "")}>
        {/* Main Editor - always rendered once */}
        <div className={cn(isLiteVariant && editable ? "min-w-0 flex-1" : "")}>
          <LiteTextEditorWithRef
            ref={ref}
            disabledExtensions={disabledExtensions}
            editable={editable}
            flaggedExtensions={liteTextEditorExtensions.flagged}
            fileHandler={fileHandler}
            getEditorMetaData={getEditorMetaData}
            handleEditorReady={(ready) => {
              if (ready) {
                setEditorRef(isMutableRefObject<EditorRefApi>(ref) ? ref.current : null);
              }
            }}
            mentionHandler={mentionHandler}
            placeholder={placeholder}
            showPlaceholderOnEmpty={showPlaceholderOnEmpty}
            containerClassName={cn(containerClassName, "relative", {
              "p-2": !editable,
            })}
            extendedEditorProps={EMPTY_EXTENDED_EDITOR_PROPS}
            editorClassName={editorClassName}
            {...rest}
          />
        </div>

        {/* Lite Toolbar - conditionally rendered */}
        {isLiteVariant && editable && (
          <LiteToolbar
            executeCommand={(item) => {
              // TODO: update this while toolbar homogenization
              // @ts-expect-error type mismatch here
              editorRef?.executeMenuItemCommand({
                itemKey: item.itemKey,
                ...item.extraProps,
              });
            }}
            onSubmit={(e) => rest.onEnterKeyPress?.(e)}
            isSubmitting={isSubmitting}
            isEmpty={isEmpty}
          />
        )}
      </div>

      {/* Full Toolbar - conditionally rendered */}
      {isFullVariant && editable && (
        <div
          className={cn(
            "origin-top overflow-hidden transition-all duration-300 ease-out",
            isFocused ? "mt-3 max-h-[200px] scale-y-100 opacity-100" : "invisible max-h-0 scale-y-0 opacity-0"
          )}
        >
          <IssueCommentToolbar
            accessSpecifier={accessSpecifier}
            executeCommand={(item) => {
              // TODO: update this while toolbar homogenization
              // @ts-expect-error type mismatch here
              editorRef?.executeMenuItemCommand({
                itemKey: item.itemKey,
                ...item.extraProps,
              });
            }}
            handleAccessChange={handleAccessChange}
            handleSubmit={(e) => rest.onEnterKeyPress?.(e)}
            isCommentEmpty={isEmpty}
            isSubmitting={isSubmitting}
            showAccessSpecifier={showAccessSpecifier}
            editorRef={editorRef}
            showSubmitButton={showSubmitButton}
            submitButtonText={submitButtonText}
          />
        </div>
      )}
    </div>
  );
});

LiteTextEditor.displayName = "LiteTextEditor";

const EMPTY_EXTENDED_EDITOR_PROPS = {};
const EMPTY_DISABLED_EXTENSIONS: TExtensions[] = [];
const NOOP_FILE_UPLOAD: TFileHandler["upload"] = async () => "";
const NOOP_FILE_DUPLICATE: TFileHandler["duplicate"] = async () => "";
