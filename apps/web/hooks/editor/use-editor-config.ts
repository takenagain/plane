/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef } from "react";
// plane imports
import type { TFileHandler } from "@plane/editor";
import { getAssetIdFromUrl, getEditorAssetDownloadSrc, getEditorAssetSrc } from "@plane/utils";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
// plane web hooks
import { useExtendedEditorConfig } from "@/hooks/editor/use-extended-editor-config";
import { useFileSize } from "@/hooks/use-file-size";
// services
import { FileService } from "@/services/file.service";
const fileService = new FileService();
const LEGACY_EDITOR_ASSET_KEY_PATTERN = /^[0-9a-f]{32}-[^/]+$/i;

export const isRestorableLegacyEditorAssetUrl = (src: string): boolean => {
  if (!src?.startsWith("http")) return false;

  const assetId = getAssetIdFromUrl(src);
  return LEGACY_EDITOR_ASSET_KEY_PATTERN.test(assetId);
};

type TArgs = {
  projectId?: string;
  uploadFile: TFileHandler["upload"];
  duplicateFile: TFileHandler["duplicate"];
  workspaceId: string;
  workspaceSlug: string;
};

type TCachedEditorFileHandler = {
  handler: TFileHandler;
  state: TArgs;
};

export const useEditorConfig = () => {
  // store hooks
  const { assetsUploadPercentage } = useEditorAsset();
  // file size
  const { maxFileSize } = useFileSize();
  const { getExtendedEditorFileHandlers } = useExtendedEditorConfig();
  const assetsUploadPercentageRef = useRef(assetsUploadPercentage);
  const maxFileSizeRef = useRef(maxFileSize);
  const getExtendedEditorFileHandlersRef = useRef(getExtendedEditorFileHandlers);
  const cachedHandlersRef = useRef(new Map<string, TCachedEditorFileHandler>());

  assetsUploadPercentageRef.current = assetsUploadPercentage;
  maxFileSizeRef.current = maxFileSize;
  getExtendedEditorFileHandlersRef.current = getExtendedEditorFileHandlers;

  const getEditorFileHandlers = useCallback((args: TArgs): TFileHandler => {
    const { projectId, uploadFile, duplicateFile, workspaceId, workspaceSlug } = args;
    const cacheKey = `${workspaceId}:${workspaceSlug}:${projectId ?? ""}`;
    const cachedHandler = cachedHandlersRef.current.get(cacheKey);

    if (cachedHandler) {
      cachedHandler.state.projectId = projectId;
      cachedHandler.state.uploadFile = uploadFile;
      cachedHandler.state.duplicateFile = duplicateFile;
      cachedHandler.state.workspaceId = workspaceId;
      cachedHandler.state.workspaceSlug = workspaceSlug;
      Object.assign(cachedHandler.handler, getExtendedEditorFileHandlersRef.current({ projectId, workspaceSlug }));

      return cachedHandler.handler;
    }

    const state = { ...args };
    const validation = {} as TFileHandler["validation"];
    Object.defineProperty(validation, "maxFileSize", {
      enumerable: true,
      get: () => maxFileSizeRef.current,
    });

    const handler = {
      cancel: fileService.cancelUpload,
      checkIfAssetExists: async (assetId: string) => {
        const res = await fileService.checkIfAssetExists(state.workspaceSlug, assetId);
        return res?.exists ?? false;
      },
      delete: async (src: string) => {
        if (src?.startsWith("http")) {
          await fileService.deleteOldWorkspaceAsset(state.workspaceId, src);
        } else {
          await fileService.deleteNewAsset(
            getEditorAssetSrc({
              assetId: src,
              projectId: state.projectId,
              workspaceSlug: state.workspaceSlug,
            }) ?? ""
          );
        }
      },
      getAssetDownloadSrc: async (path) => {
        if (!path) return "";
        if (path?.startsWith("http")) {
          return path;
        } else {
          return (
            getEditorAssetDownloadSrc({
              assetId: path,
              projectId: state.projectId,
              workspaceSlug: state.workspaceSlug,
            }) ?? ""
          );
        }
      },
      getAssetSrc: async (path) => {
        if (!path) return "";
        if (path?.startsWith("http")) {
          return path;
        } else {
          return (
            getEditorAssetSrc({
              assetId: path,
              projectId: state.projectId,
              workspaceSlug: state.workspaceSlug,
            }) ?? ""
          );
        }
      },
      restore: async (src: string) => {
        if (src?.startsWith("http")) {
          if (!isRestorableLegacyEditorAssetUrl(src)) return;
          await fileService.restoreOldEditorAsset(state.workspaceId, src);
        } else {
          await fileService.restoreNewAsset(state.workspaceSlug, src);
        }
      },
      upload: (...params) => state.uploadFile(...params),
      duplicate: (...params) => state.duplicateFile(...params),
      validation,
    } as TFileHandler;

    Object.defineProperty(handler, "assetsUploadStatus", {
      enumerable: true,
      get: () => assetsUploadPercentageRef.current,
    });

    Object.assign(handler, getExtendedEditorFileHandlersRef.current({ projectId, workspaceSlug }));
    cachedHandlersRef.current.set(cacheKey, {
      handler,
      state,
    });

    return handler;
  }, []);

  return {
    getEditorFileHandlers,
  };
};
