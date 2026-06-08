/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEditor as useTiptapEditor, useEditorState } from "@tiptap/react";
import { useImperativeHandle, useEffect, useMemo, useRef } from "react";
import type { MarkdownStorage } from "tiptap-markdown";
// extensions
import { CoreEditorExtensions } from "@/extensions";
// helpers
import { getEditorRefHelpers } from "@/helpers/editor-ref";
// props
import { CoreEditorProps } from "@/props";
// types
import type { TEditorHookProps } from "@/types";

declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownStorage;
  }
}

const EMPTY_EDITOR_PROPS = {};
const EMPTY_EXTENSIONS: NonNullable<TEditorHookProps["extensions"]> = [];

export const useEditor = (props: TEditorHookProps) => {
  const {
    autofocus = false,
    disabledExtensions,
    editable = true,
    editorClassName = "",
    editorProps,
    enableHistory,
    extendedEditorProps,
    extensions = EMPTY_EXTENSIONS,
    fileHandler,
    flaggedExtensions,
    forwardedRef,
    getEditorMetaData,
    handleEditorReady,
    id = "",
    initialValue,
    isTouchDevice,
    mentionHandler,
    onAssetChange,
    onChange,
    onEditorFocus,
    onTransaction,
    placeholder,
    showPlaceholderOnEmpty,
    tabIndex,
    provider,
    value,
  } = props;
  const effectiveEditorProps = editorProps ?? EMPTY_EDITOR_PROPS;
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  const resolvedEditorProps = useMemo(
    () => ({
      ...CoreEditorProps({
        editorClassName,
      }),
      ...effectiveEditorProps,
    }),
    [editorClassName, effectiveEditorProps]
  );
  const resolvedExtensions = useMemo(
    () => [
      ...CoreEditorExtensions({
        disabledExtensions,
        editable,
        enableHistory,
        extendedEditorProps,
        fileHandler,
        flaggedExtensions,
        getEditorMetaData,
        isTouchDevice,
        mentionHandler,
        placeholder,
        showPlaceholderOnEmpty,
        tabIndex,
        provider,
      }),
      ...extensions,
    ],
    [
      disabledExtensions,
      editable,
      enableHistory,
      extendedEditorProps,
      extensions,
      fileHandler,
      flaggedExtensions,
      getEditorMetaData,
      isTouchDevice,
      mentionHandler,
      placeholder,
      provider,
      showPlaceholderOnEmpty,
      tabIndex,
    ]
  );

  const editor = useTiptapEditor(
    {
      editable,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      autofocus,
      editorProps: resolvedEditorProps,
      extensions: resolvedExtensions,
      content: initialValueRef.current,
      parseOptions: { preserveWhitespace: true },
      onCreate: () => handleEditorReady?.(true),
      onTransaction: () => {
        onTransaction?.();
      },
      onUpdate: ({ editor: currentEditor, transaction }) => {
        const isMigrationUpdate = transaction?.getMeta("uniqueIdOnlyChange") === true;
        onChange?.(currentEditor.getJSON(), currentEditor.getHTML(), { isMigrationUpdate });
      },
      onDestroy: () => handleEditorReady?.(false),
      onFocus: () => onEditorFocus?.(),
    },
    [editable, id, resolvedExtensions]
  );

  // Effect for syncing SWR data
  useEffect(() => {
    // value is null when intentionally passed where syncing is not yet
    // supported and value is undefined when the data from swr is not populated
    if (value == null) return;
    if (editor) {
      const { uploadInProgress: isUploadInProgress } = editor.storage.utility;
      if (!editor.isDestroyed && !isUploadInProgress) {
        try {
          editor.commands.setContent(value, {
            emitUpdate: false,
            parseOptions: { preserveWhitespace: true },
          });
          if (editor.state.selection) {
            const docLength = editor.state.doc.content.size;
            const relativePosition = Math.min(editor.state.selection.from, docLength - 1);
            editor.commands.setTextSelection(relativePosition);
          }
        } catch (error) {
          console.error("Error syncing editor content with external value:", error);
        }
      }
    }
  }, [editor, value, id]);

  // update assets upload status
  useEffect(() => {
    if (!editor) return;
    const assetsUploadStatus = fileHandler.assetsUploadStatus;
    editor.commands.updateAssetsUploadStatus?.(assetsUploadStatus);
  }, [editor, fileHandler.assetsUploadStatus]);

  // subscribe to assets list changes
  const assetsList = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      assets: currentEditor?.storage.utility?.assetsList ?? [],
    }),
  });
  // trigger callback when assets list changes
  useEffect(() => {
    const assets = assetsList?.assets;
    if (!assets || !onAssetChange) return;
    onAssetChange(assets);
  }, [assetsList?.assets, onAssetChange]);

  useImperativeHandle(
    forwardedRef,
    () =>
      getEditorRefHelpers({
        editor,
        getEditorMetaData,
        provider,
      }),
    [editor, getEditorMetaData, provider]
  );

  if (!editor) {
    return null;
  }

  return editor;
};
