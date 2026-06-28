/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { ToggleSwitch } from "../button/toggle-switch";

export interface LockdownModeToggleProps {
  /** True when the account has >= 2 confirmed hardware security keys (R4). */
  eligible: boolean;
  enabled: boolean;
  /** Toggle handler; the server enforces eligibility and step-up. Should throw on error. */
  onToggle: (enable: boolean) => Promise<void> | void;
  disabled?: boolean;
  labels?: Partial<{
    title: string;
    description: string;
  }>;
}

const DEFAULT_LABELS = {
  title: "Hardware key lockdown",
  description:
    "When on, you can only sign in with a registered hardware security key. Keep at least two keys in safe places.",
};

/**
 * Renders nothing unless the account is lockdown-eligible (>= 2 hardware keys).
 * The server is the source of truth; this only reflects and toggles the flag.
 */
export function LockdownModeToggle({ eligible, enabled, onToggle, disabled = false, labels }: LockdownModeToggleProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };

  if (!eligible) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-strong bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-primary" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <span className="text-13 font-medium text-primary">{copy.title}</span>
          <span className="text-11 text-tertiary">{copy.description}</span>
        </div>
      </div>
      <ToggleSwitch value={enabled} onChange={(value) => void onToggle(value)} disabled={disabled} label={copy.title} />
    </div>
  );
}
