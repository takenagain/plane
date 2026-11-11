import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToEditorView } from "./editor-view";

const editors: Editor[] = [];
function createEditor(element: HTMLElement | null = null) {
  const editor = new Editor({ element, extensions: [StarterKit] });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("bubble menu editor view lifecycle", () => {
  it("does not access the DOM before the editor mounts", () => {
    const editor = createEditor();
    const attach = vi.fn(() => vi.fn());
    const unsubscribe = subscribeToEditorView(editor, attach);
    expect(attach).not.toHaveBeenCalled();
    editor.mount(document.createElement("div"));
    expect(attach).toHaveBeenCalledWith(editor.view.dom);
    unsubscribe();
  });

  it("detaches listeners on unmount and reattaches them to the new view", () => {
    const editor = createEditor();
    const cleanup = vi.fn();
    const attach = vi.fn(() => cleanup);
    const unsubscribe = subscribeToEditorView(editor, attach);
    editor.mount(document.createElement("div"));
    const firstElement = editor.view.dom;
    editor.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    editor.mount(document.createElement("div"));
    expect(editor.view.dom).not.toBe(firstElement);
    expect(attach).toHaveBeenCalledTimes(2);
    expect(attach).toHaveBeenLastCalledWith(editor.view.dom);
    unsubscribe();
    expect(cleanup).toHaveBeenCalledTimes(2);
    editor.unmount();
    editor.mount(document.createElement("div"));
    expect(attach).toHaveBeenCalledTimes(2);
  });

  it("binds an already mounted view and cleans up exactly once", () => {
    const editor = createEditor(document.createElement("div"));
    const cleanup = vi.fn();
    const attach = vi.fn(() => cleanup);
    const unsubscribe = subscribeToEditorView(editor, attach);
    expect(attach).toHaveBeenCalledTimes(1);
    unsubscribe();
    editor.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
