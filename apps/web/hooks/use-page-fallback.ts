/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "lodash-es";
import type { EditorRefApi, CollaborationState } from "@plane/editor";
// plane editor
import { convertBinaryDataToBase64String, getBinaryDataFromDocumentEditorHTMLString } from "@plane/editor";
// plane types
import type { TDocumentPayload } from "@plane/types";
// hooks
import useAutoSave from "@/hooks/use-auto-save";
import type { TPageInstance } from "@/store/pages/base-page";

type TArgs = {
  editorRef: React.RefObject<EditorRefApi | null>;
  editorReady: boolean;
  fetchPageDescription: () => Promise<ArrayBuffer>;
  collaborationState: CollaborationState | null;
  updatePageDescription: (data: TDocumentPayload) => Promise<void>;
  page: TPageInstance;
};

export const usePageFallback = (args: TArgs) => {
  const { editorRef, editorReady, fetchPageDescription, collaborationState, updatePageDescription, page } = args;
  const hasShownFallbackToast = useRef(false);
  const hasHydratedFromServerRef = useRef(false);
  const isSavingRef = useRef(false);

  const [isFetchingFallbackBinary, setIsFetchingFallbackBinary] = useState(false);

  // Derive connection failure from collaboration state
  const hasConnectionFailed = collaborationState?.stage.kind === "disconnected";

  // Reset per-page hydration when navigating to another page
  useEffect(() => {
    hasHydratedFromServerRef.current = false;
    hasShownFallbackToast.current = false;
    // The page id intentionally triggers this reset when the MobX page instance changes.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [page.id]);

  const hydrateFromServer = useCallback(async () => {
    if (!hasConnectionFailed || hasHydratedFromServerRef.current) return;
    if (collaborationState?.hasCachedContent) {
      hasHydratedFromServerRef.current = true;
      return;
    }

    const editor = editorRef.current;
    if (!editor) return;

    try {
      setIsFetchingFallbackBinary(true);

      const latestEncodedDescription = await fetchPageDescription();
      let latestDecodedDescription: Uint8Array;
      if (latestEncodedDescription && latestEncodedDescription.byteLength > 0) {
        latestDecodedDescription = new Uint8Array(latestEncodedDescription);
      } else {
        const pageDescriptionHtml = page.description_html;
        latestDecodedDescription = getBinaryDataFromDocumentEditorHTMLString(
          pageDescriptionHtml ?? "<p></p>",
          page.name
        );
      }

      editor.setProviderDocument(latestDecodedDescription);
      hasHydratedFromServerRef.current = true;
    } catch (error: unknown) {
      console.error(error);
    } finally {
      setIsFetchingFallbackBinary(false);
    }
  }, [
    collaborationState?.hasCachedContent,
    editorRef,
    fetchPageDescription,
    hasConnectionFailed,
    page.description_html,
    page.name,
  ]);

  const saveDescription = useCallback(async () => {
    if (isSavingRef.current) return;

    const editor = editorRef.current;
    if (!editor) return;

    if (hasConnectionFailed && !hasShownFallbackToast.current) {
      console.warn("Websocket Connection lost, your changes are being saved using backup mechanism.");
      hasShownFallbackToast.current = true;
    }

    try {
      isSavingRef.current = true;

      const { binary, html, json } = editor.getDocument();
      if (!html?.trim()) return;

      // Yjs encodes an uninitialized document as [0, 0]. Wait for its
      // content/history before saving; the description API rejects this update.
      if (binary?.length === 2 && binary[0] === 0 && binary[1] === 0) return;

      // editor.getDocument() always returns binary + json for the document
      // editor, so the fallbacks below only satisfy the TDocumentPayload type
      // and never fire in this path. This mirrors convertHTMLDocumentToAllFormats,
      // which always sends all three fields; the backend description endpoint
      // also treats each field as optional.
      const payload: TDocumentPayload = {
        description_html: html,
        description_json: json ?? {},
        description_binary: binary ? convertBinaryDataToBase64String(binary) : "",
      };

      await updatePageDescription(payload);
    } catch (error: unknown) {
      console.error(error);
    } finally {
      isSavingRef.current = false;
    }
  }, [editorRef, hasConnectionFailed, updatePageDescription]);

  // Debounced save so edits persist without waiting for the live-server store interval.
  const debouncedSaveRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    const debouncedSave = debounce(() => void saveDescription(), 1000);
    debouncedSaveRef.current = debouncedSave;
    return () => {
      debouncedSave.cancel();
      if (debouncedSaveRef.current === debouncedSave) debouncedSaveRef.current = null;
    };
  }, [saveDescription]);

  // Flush pending saves before navigation/reload so content is not lost.
  useEffect(() => {
    const flushPendingSave = () => {
      debouncedSaveRef.current?.flush();
    };

    window.addEventListener("pagehide", flushPendingSave);
    window.addEventListener("beforeunload", flushPendingSave);

    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      window.removeEventListener("beforeunload", flushPendingSave);
    };
  }, []);

  useEffect(() => {
    if (!editorReady) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let rafId = 0;

    const subscribe = () => {
      if (cancelled) return;

      const editor = editorRef.current;
      if (!editor) {
        rafId = requestAnimationFrame(subscribe);
        return;
      }

      unsubscribe = editor.onStateChange(() => {
        debouncedSaveRef.current?.();
      });
    };

    subscribe();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      unsubscribe?.();
      debouncedSaveRef.current?.cancel();
    };
    // The page id intentionally tears down the old editor subscription when navigating.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [editorRef, editorReady, page.id]);

  useEffect(() => {
    if (hasConnectionFailed) {
      // Hydration sets the loading indicator while the async request is in flight.
      // oxlint-disable-next-line react/set-state-in-effect
      void hydrateFromServer();
    } else {
      hasShownFallbackToast.current = false;
    }
  }, [hasConnectionFailed, hydrateFromServer]);

  useAutoSave(saveDescription);

  return { isFetchingFallbackBinary };
};
