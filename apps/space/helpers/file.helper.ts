/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";

/**
 * @description combine the file path with the base URL
 * @param {string} path
 * @returns {string} final URL with the base URL
 */
export const getFileURL = (path: string): string | undefined => {
  if (!path) return undefined;
  const isValidURL = path.startsWith("http");
  if (isValidURL) return path;
  return `${API_BASE_URL}${path}`;
};

/**
 * @description this function returns the assetId from the asset source
 * @param {string} src
 * @returns {string} assetId
 */
export const getAssetIdFromUrl = (src: string): string => {
  if (!src) return "";

  const normalizedSrc = src.charAt(src.length - 1) === "/" ? src.slice(0, -1) : src;

  if (normalizedSrc.startsWith("http")) {
    try {
      const sourceUrl = new URL(normalizedSrc);
      const sourcePaths = sourceUrl.pathname.split("/").filter(Boolean);
      return sourcePaths[sourcePaths.length - 1] ?? "";
    } catch {
      // Fall back to the generic parser below for malformed URLs.
    }
  }

  const sourcePath = normalizedSrc.split(/[?#]/, 1)[0] ?? "";
  const sourcePaths = sourcePath.split("/").filter(Boolean);
  return sourcePaths[sourcePaths.length - 1] ?? "";
};
