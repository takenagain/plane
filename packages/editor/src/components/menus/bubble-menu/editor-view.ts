import type { Editor } from "@tiptap/core";

/** Bind DOM listeners only while Tiptap has a mounted view, including remounts. */
export function subscribeToEditorView(editor: Editor, attach: (element: HTMLElement) => () => void): () => void {
  let cleanup: (() => void) | undefined;
  const detach = () => {
    cleanup?.();
    cleanup = undefined;
  };
  const mount = () => {
    detach();
    if (!editor.isDestroyed) cleanup = attach(editor.view.dom);
  };

  editor.on("mount", mount);
  editor.on("unmount", detach);
  mount();
  return () => {
    editor.off("mount", mount);
    editor.off("unmount", detach);
    detach();
  };
}
