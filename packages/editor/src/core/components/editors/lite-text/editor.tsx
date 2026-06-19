/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useMemo, useRef } from "react";
// components
import { EditorWrapper } from "@/components/editors/editor-wrapper";
// extensions
import { EnterKeyExtension } from "@/extensions";
// types
import type { EditorRefApi, ILiteTextEditorProps } from "@/types";

const EMPTY_EXTENSIONS: NonNullable<ILiteTextEditorProps["extensions"]> = [];

function LiteTextEditor(props: ILiteTextEditorProps) {
  const { onEnterKeyPress, disabledExtensions, extensions: externalExtensions = EMPTY_EXTENSIONS } = props;
  const onEnterKeyPressRef = useRef(onEnterKeyPress);
  onEnterKeyPressRef.current = onEnterKeyPress;

  const extensions = useMemo(() => {
    const resolvedExtensions = [...externalExtensions];

    if (!disabledExtensions?.includes("enter-key")) {
      resolvedExtensions.push(EnterKeyExtension(() => onEnterKeyPressRef.current?.()));
    }

    return resolvedExtensions;
  }, [externalExtensions, disabledExtensions]);

  return <EditorWrapper {...props} extensions={extensions} />;
}

const LiteTextEditorWithRef = forwardRef(function LiteTextEditorWithRef(
  props: ILiteTextEditorProps,
  ref: React.ForwardedRef<EditorRefApi>
) {
  return <LiteTextEditor {...props} forwardedRef={ref as React.MutableRefObject<EditorRefApi | null>} />;
});

LiteTextEditorWithRef.displayName = "LiteTextEditorWithRef";

export { LiteTextEditorWithRef };
