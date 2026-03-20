/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { isRestorableLegacyEditorAssetUrl } from "../use-editor-config";

describe("isRestorableLegacyEditorAssetUrl", () => {
  it("accepts legacy workspace asset URLs", () => {
    expect(
      isRestorableLegacyEditorAssetUrl(
        "https://cdn.example.com/workspace/0123456789abcdef0123456789abcdef-work-item.png"
      )
    ).toBe(true);
  });

  it("accepts legacy workspace asset URLs with signed query parameters", () => {
    expect(
      isRestorableLegacyEditorAssetUrl(
        "https://cdn.example.com/workspace/0123456789abcdef0123456789abcdef-work-item.png?X-Amz-Signature=test"
      )
    ).toBe(true);
  });

  it("ignores non-plane external images", () => {
    expect(isRestorableLegacyEditorAssetUrl("https://media.docs.plane.so/seed_assets/31.png")).toBe(false);
  });
});
