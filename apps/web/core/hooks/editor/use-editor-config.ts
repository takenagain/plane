/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
// plane imports
import type { TFileHandler } from "@plane/editor";
import { getAssetIdFromUrl, getEditorAssetDownloadSrc, getEditorAssetSrc } from "@plane/utils";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
// plane web hooks
import { useExtendedEditorConfig } from "@/plane-web/hooks/editor/use-extended-editor-config";
import { useFileSize } from "@/plane-web/hooks/use-file-size";
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

export const useEditorConfig = () => {
  // store hooks
  const { assetsUploadPercentage } = useEditorAsset();
  // file size
  const { maxFileSize } = useFileSize();
  const { getExtendedEditorFileHandlers } = useExtendedEditorConfig();

  const getEditorFileHandlers = useCallback(
    (args: TArgs): TFileHandler => {
      const { projectId, uploadFile, duplicateFile, workspaceId, workspaceSlug } = args;

      return {
        assetsUploadStatus: assetsUploadPercentage,
        cancel: fileService.cancelUpload,
        checkIfAssetExists: async (assetId: string) => {
          const res = await fileService.checkIfAssetExists(workspaceSlug, assetId);
          return res?.exists ?? false;
        },
        delete: async (src: string) => {
          if (src?.startsWith("http")) {
            await fileService.deleteOldWorkspaceAsset(workspaceId, src);
          } else {
            await fileService.deleteNewAsset(
              getEditorAssetSrc({
                assetId: src,
                projectId,
                workspaceSlug,
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
                projectId,
                workspaceSlug,
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
                projectId,
                workspaceSlug,
              }) ?? ""
            );
          }
        },
        restore: async (src: string) => {
          if (src?.startsWith("http")) {
            if (!isRestorableLegacyEditorAssetUrl(src)) return;
            await fileService.restoreOldEditorAsset(workspaceId, src);
          } else {
            await fileService.restoreNewAsset(workspaceSlug, src);
          }
        },
        upload: uploadFile,
        duplicate: duplicateFile,
        validation: {
          maxFileSize,
        },
        ...getExtendedEditorFileHandlers({ projectId, workspaceSlug }),
      };
    },
    [assetsUploadPercentage, getExtendedEditorFileHandlers, maxFileSize]
  );

  return {
    getEditorFileHandlers,
  };
};
