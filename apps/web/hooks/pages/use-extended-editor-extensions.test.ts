import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useExtendedEditorProps } from "./use-extended-editor-extensions";
import type { TExtendedEditorExtensionsHookParams } from "./use-extended-editor-extensions";

describe("page editor extension configuration", () => {
  it("retains its identity across parent renders so Tiptap preserves its view", () => {
    const props = { workspaceSlug: "workspace" } as TExtendedEditorExtensionsHookParams;
    const { result, rerender } = renderHook(() => useExtendedEditorProps(props));
    const initial = result.current;
    rerender();
    expect(result.current).toBe(initial);
  });
});
