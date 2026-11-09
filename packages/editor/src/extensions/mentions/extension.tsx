/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// types
import type { TMentionHandler } from "@/types";
// extension config
import { CustomMentionExtensionConfig, type TMentionExtensionOptions } from "./extension-config";
// node view
import type { MentionNodeViewProps } from "./mention-node-view";
import { MentionNodeView } from "./mention-node-view";
// utils
import { renderMentionsDropdown } from "./utils";

export function CustomMentionExtension(props: TMentionHandler) {
  const { searchCallback, renderComponent, getMentionedEntityDetails } = props;
  return CustomMentionExtensionConfig.extend({
    addOptions(this) {
      const parentOptions = this.parent?.();
      return {
        ...parentOptions,
        HTMLAttributes: {},
        renderText: ({ node }) => node.attrs.label ?? node.attrs.id ?? "",
        renderHTML: ({ node }) => ["mention-component", {}, String(node.attrs.id ?? "")],
        renderComponent,
        getMentionedEntityDetails,
      } as TMentionExtensionOptions;
    },

    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps) => (
        <MentionNodeView {...nodeViewProps} node={nodeViewProps.node as MentionNodeViewProps["node"]} />
      ));
    },
  }).configure({
    suggestion: {
      render: renderMentionsDropdown({
        searchCallback,
      }),
      allowSpaces: true,
    },
  });
}
