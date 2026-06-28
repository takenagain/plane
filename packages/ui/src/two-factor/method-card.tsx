/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { Fingerprint, KeyRound, Smartphone } from "lucide-react";
import type { TMfaMethod } from "@plane/types";
import { cn } from "../utils";

export interface MethodCardProps {
  type: TMfaMethod;
  title?: string;
  subtitle?: string;
  recommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  selected?: boolean;
  onSelect?: (type: TMfaMethod) => void;
  /** "Recommended" pill label, overridable for i18n. */
  recommendedLabel?: string;
}

const DEFAULT_COPY: Record<TMfaMethod, { title: string; subtitle: string }> = {
  passkey: {
    title: "Passkey",
    subtitle: "Use Face ID, Touch ID, or Windows Hello",
  },
  security_key: {
    title: "Security key",
    subtitle: "Use a hardware key like YubiKey (USB / NFC)",
  },
  totp: {
    title: "Authenticator app",
    subtitle: "Use a TOTP app — works on any device",
  },
};

const METHOD_ICON: Record<TMfaMethod, React.ReactNode> = {
  passkey: <Fingerprint className="size-5" />,
  security_key: <KeyRound className="size-5" />,
  totp: <Smartphone className="size-5" />,
};

/**
 * A selectable, keyboard-operable method card with radio semantics. Disabled
 * cards always render an inline reason rather than being silently greyed out.
 */
export function MethodCard({
  type,
  title,
  subtitle,
  recommended = false,
  disabled = false,
  disabledReason,
  selected = false,
  onSelect,
  recommendedLabel = "Recommended",
}: MethodCardProps) {
  const resolvedTitle = title ?? DEFAULT_COPY[type].title;
  const resolvedSubtitle = subtitle ?? DEFAULT_COPY[type].subtitle;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && onSelect?.(type)}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
        "focus-visible:ring-accent-primary focus:outline-none focus-visible:ring-2",
        selected ? "border-accent-primary bg-accent-primary/5" : "border-strong bg-surface-1 hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-60 hover:bg-surface-1"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-md",
          selected ? "bg-accent-primary/10 text-accent-primary" : "bg-surface-2 text-secondary"
        )}
        aria-hidden="true"
      >
        {METHOD_ICON[type]}
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-13 font-medium text-primary">{resolvedTitle}</span>
          {recommended && (
            <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-10 font-medium text-accent-primary">
              {recommendedLabel}
            </span>
          )}
        </span>
        <span className="text-11 text-tertiary">{resolvedSubtitle}</span>
        {disabled && disabledReason && (
          <span className="mt-1 text-11 text-danger-primary" role="note">
            {disabledReason}
          </span>
        )}
      </span>
    </button>
  );
}
