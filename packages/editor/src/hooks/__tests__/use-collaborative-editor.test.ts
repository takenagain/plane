import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Doc } from "yjs";
import { useCollaborativeEditor } from "../use-collaborative-editor";

const state = vi.hoisted(() => ({ configs: [] as { extensions: unknown; editorProps: unknown }[] }));
vi.mock("@/hooks/use-editor", () => ({
  useEditor: (config: { extensions: unknown; editorProps: unknown }) => {
    state.configs.push(config);
    return null;
  },
}));
vi.mock("../use-title-editor", () => ({ useTitleEditor: () => null }));
vi.mock("@/extensions", () => ({ SideMenuExtension: () => ({}), HeadingListExtension: {} }));
vi.mock("@/extensions/document-extensions", () => ({ DocumentEditorAdditionalExtensions: () => [] }));

const container = document.createElement("div");
let root = createRoot(container);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  state.configs.length = 0;
});

describe("collaborative editor configuration", () => {
  it("keeps omitted extension and DOM-prop defaults stable across parent renders", async () => {
    const doc = new Doc();
    const props = {
      id: "page",
      provider: { document: doc },
      user: { id: "user", name: "User", color: "red" },
      actions: { signalForcedClose: vi.fn() },
    } as unknown as Parameters<typeof useCollaborativeEditor>[0];
    function Harness({ tick }: { tick: number }) {
      void tick;
      useCollaborativeEditor(props);
      return null;
    }
    await act(async () => root.render(createElement(Harness, { tick: 0 })));
    const first = state.configs.at(-1)!;
    await act(async () => root.render(createElement(Harness, { tick: 1 })));
    expect(state.configs.at(-1)!.extensions).toBe(first.extensions);
    expect(state.configs.at(-1)!.editorProps).toBe(first.editorProps);
    doc.destroy();
  });
});
