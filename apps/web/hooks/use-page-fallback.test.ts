import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageFallback } from "./use-page-fallback";

vi.mock("@plane/editor", () => ({
  convertBinaryDataToBase64String: () => "encoded-document",
  getBinaryDataFromDocumentEditorHTMLString: vi.fn(),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function setup(binary: Uint8Array, html = "<p>Saved content</p>") {
  const getDocument = vi.fn(() => ({ binary, html, json: {} }));
  const updatePageDescription = vi.fn().mockResolvedValue(undefined);
  renderHook(() =>
    usePageFallback({
      editorRef: { current: { getDocument } },
      editorReady: false,
      collaborationState: null,
      fetchPageDescription: vi.fn(),
      updatePageDescription,
      page: { id: "page" },
    } as unknown as Parameters<typeof usePageFallback>[0])
  );
  return { getDocument, updatePageDescription };
}

async function autosave() {
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
}

describe("page autosave initialization", () => {
  it("waits for a populated collaboration document before submitting binary data", async () => {
    const { getDocument, updatePageDescription } = setup(new Uint8Array([0, 0]));
    await autosave();
    expect(updatePageDescription).not.toHaveBeenCalled();

    getDocument.mockReturnValue({ binary: new Uint8Array([1, 2, 3, 4]), html: "<p>Saved content</p>", json: {} });
    await autosave();
    expect(updatePageDescription).toHaveBeenCalledWith({
      description_binary: "encoded-document",
      description_html: "<p>Saved content</p>",
      description_json: {},
    });
  });

  it("still saves a cleared body when the document contains collaboration history", async () => {
    const { updatePageDescription } = setup(new Uint8Array([1, 2, 3, 4]), "<p></p>");
    await autosave();
    expect(updatePageDescription).toHaveBeenCalledWith(expect.objectContaining({ description_html: "<p></p>" }));
  });
});
