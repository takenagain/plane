/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import StarterKit from "@tiptap/starter-kit";

type TArgs = {
  enableHistory: boolean;
};

export const CustomStarterKitExtension = (args: TArgs) => {
  const { enableHistory } = args;

  return StarterKit.configure({
    bulletList: {
      HTMLAttributes: {
        class: "list-disc pl-7 space-y-(--list-spacing-y)",
      },
    },
    orderedList: {
      HTMLAttributes: {
        class: "list-decimal pl-7 space-y-(--list-spacing-y)",
      },
    },
    listItem: {
      HTMLAttributes: {
        class: "not-prose space-y-2",
      },
    },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    blockquote: false,
    // StarterKit 3 bundles link, underline and listKeymap. We register our own
    // CustomLinkExtension, Underline and ListKeymap separately, so disable the
    // bundled ones here to avoid duplicate-extension-name collisions.
    link: false,
    underline: false,
    listKeymap: false,
    paragraph: {
      HTMLAttributes: {
        class: "editor-paragraph-block",
      },
    },
    heading: {
      HTMLAttributes: {
        class: "editor-heading-block",
      },
    },
    dropcursor: {
      class:
        "text-tertiary transition-all motion-reduce:transition-none motion-reduce:hover:transform-none duration-200 ease-[cubic-bezier(0.165, 0.84, 0.44, 1)]",
    },
    // StarterKit 3 renamed the `history` option to `undoRedo`; `history: false`
    // is now silently ignored. Disable undo/redo when history is off (e.g. when
    // Yjs collaboration provides its own history).
    ...(enableHistory ? {} : { undoRedo: false }),
  });
};
