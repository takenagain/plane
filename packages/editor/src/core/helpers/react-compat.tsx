/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { FloatingOverlay as BaseFloatingOverlay } from "@floating-ui/react";
import type { CSSProperties, ElementType } from "react";
import { createElement } from "react";

/**
 * Icon type compatible with lucide-react and @plane/propel/icons when multiple
 * @types/react versions are present in the dependency tree.
 */
export type TEditorIcon = unknown;

type EditorFloatingOverlayProps = {
  style?: CSSProperties;
  lockScroll?: boolean;
};

export function EditorIcon(props: { icon: TEditorIcon } & Record<string, unknown>) {
  const { icon, ...rest } = props;
  return createElement(icon as ElementType, rest);
}

export function EditorFloatingOverlay(props: EditorFloatingOverlayProps) {
  return createElement(BaseFloatingOverlay as ElementType, props);
}

/** Normalize floating-ui / csstype style objects for React 18 CSSProperties. */
export function editorFloatingStyle(style: Record<string, unknown>): CSSProperties {
  return style as CSSProperties;
}
