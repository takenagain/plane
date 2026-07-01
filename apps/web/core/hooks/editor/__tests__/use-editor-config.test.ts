import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  assetsUploadPercentage: {} as Record<string, number>,
  maxFileSize: 5_242_880,
  getExtendedEditorFileHandlers: vi.fn(() => ({})),
}));

vi.mock("@/hooks/store/use-editor-asset", () => ({
  useEditorAsset: () => ({
    assetsUploadPercentage: hookMocks.assetsUploadPercentage,
  }),
}));

vi.mock("@/plane-web/hooks/editor/use-extended-editor-config", () => ({
  useExtendedEditorConfig: () => ({
    getExtendedEditorFileHandlers: hookMocks.getExtendedEditorFileHandlers,
  }),
}));

vi.mock("@/plane-web/hooks/use-file-size", () => ({
  useFileSize: () => ({
    maxFileSize: hookMocks.maxFileSize,
  }),
}));

import { isRestorableLegacyEditorAssetUrl, useEditorConfig } from "../use-editor-config";

describe("isRestorableLegacyEditorAssetUrl", () => {
  beforeEach(() => {
    hookMocks.assetsUploadPercentage = {};
    hookMocks.maxFileSize = 5_242_880;
    hookMocks.getExtendedEditorFileHandlers.mockReset();
    hookMocks.getExtendedEditorFileHandlers.mockReturnValue({});
  });

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

  it("keeps file handlers stable while upload progress changes", () => {
    const uploadFile = vi.fn(async () => "asset-id");
    const duplicateFile = vi.fn(async () => "asset-id");
    const { result, rerender } = renderHook(() => useEditorConfig());

    const initialHandler = result.current.getEditorFileHandlers({
      projectId: "project-1",
      uploadFile,
      duplicateFile,
      workspaceId: "workspace-1",
      workspaceSlug: "demo-workspace",
    });

    hookMocks.assetsUploadPercentage = { "block-1": 42 };
    hookMocks.maxFileSize = 10_485_760;
    rerender();

    const updatedHandler = result.current.getEditorFileHandlers({
      projectId: "project-1",
      uploadFile,
      duplicateFile,
      workspaceId: "workspace-1",
      workspaceSlug: "demo-workspace",
    });

    expect(updatedHandler).toBe(initialHandler);
    expect(updatedHandler.assetsUploadStatus).toEqual({ "block-1": 42 });
    expect(updatedHandler.validation.maxFileSize).toBe(10_485_760);
  });
});
