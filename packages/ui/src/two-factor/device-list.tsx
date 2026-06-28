/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useState } from "react";
import { Check, Fingerprint, KeyRound, Pencil, Plus, Smartphone, Trash2, X } from "lucide-react";
import type { IMfaDevice, TMfaMethod } from "@plane/types";
import { Button } from "../button/button";
import { cn } from "../utils";

export interface TwoFactorDeviceListProps {
  devices: IMfaDevice[];
  onAddMethod?: () => void;
  onRename?: (deviceId: string, name: string) => Promise<void> | void;
  onDelete?: (deviceId: string) => Promise<void> | void;
  /** Slot for the `<LockdownModeToggle />` (rendered below the list). */
  footer?: React.ReactNode;
  labels?: Partial<{
    title: string;
    empty: string;
    addMethod: string;
    rename: string;
    remove: string;
    save: string;
    cancel: string;
    passkeyBadge: string;
    securityKeyBadge: string;
    totpBadge: string;
    pendingBadge: string;
    lastUsed: string;
    neverUsed: string;
  }>;
}

const DEFAULT_LABELS = {
  title: "Your authentication methods",
  empty: "You haven't added any authentication methods yet.",
  addMethod: "Add method",
  rename: "Rename",
  remove: "Remove",
  save: "Save",
  cancel: "Cancel",
  passkeyBadge: "Passkey",
  securityKeyBadge: "Security key",
  totpBadge: "Authenticator app",
  pendingBadge: "Unconfirmed",
  lastUsed: "Last used",
  neverUsed: "Never used",
};

const deviceMethod = (device: IMfaDevice): TMfaMethod => {
  if (device.device_type === "TOTP") return "totp";
  return device.is_hardware_security_key ? "security_key" : "passkey";
};

const METHOD_ICON: Record<TMfaMethod, React.ReactNode> = {
  passkey: <Fingerprint className="size-4" />,
  security_key: <KeyRound className="size-4" />,
  totp: <Smartphone className="size-4" />,
};

export function TwoFactorDeviceList({
  devices,
  onAddMethod,
  onRename,
  onDelete,
  footer,
  labels,
}: TwoFactorDeviceListProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const badgeLabel = (method: TMfaMethod) =>
    method === "passkey" ? copy.passkeyBadge : method === "security_key" ? copy.securityKeyBadge : copy.totpBadge;

  const startRename = (device: IMfaDevice) => {
    setEditingId(device.id);
    setDraftName(device.name);
  };

  const commitRename = async (deviceId: string) => {
    await onRename?.(deviceId, draftName.trim());
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-13 font-medium text-secondary">{copy.title}</h3>
        {onAddMethod && (
          <Button type="button" variant="neutral-primary" size="sm" onClick={onAddMethod} prependIcon={<Plus />}>
            {copy.addMethod}
          </Button>
        )}
      </div>

      {devices.length === 0 ? (
        <p className="rounded-md border border-strong bg-surface-1 p-4 text-13 text-tertiary">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {devices.map((device) => {
            const method = deviceMethod(device);
            const isEditing = editingId === device.id;
            return (
              <li
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-md border border-strong bg-surface-1 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-secondary"
                    aria-hidden="true"
                  >
                    {METHOD_ICON[method]}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    {isEditing ? (
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        autoFocus
                        aria-label={copy.rename}
                        className="focus-visible:ring-accent-primary h-7 w-40 rounded-sm border border-strong bg-surface-1 px-2 text-13 text-primary focus:outline-none focus-visible:ring-2"
                      />
                    ) : (
                      <span className="truncate text-13 font-medium text-primary">
                        {device.name || badgeLabel(method)}
                      </span>
                    )}
                    <span className="flex items-center gap-2 text-11 text-tertiary">
                      <span>{badgeLabel(method)}</span>
                      {!device.is_confirmed && (
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-10 text-warning-primary">
                          {copy.pendingBadge}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>
                        {device.last_used_at ? `${copy.lastUsed} ${device.last_used_at.slice(0, 10)}` : copy.neverUsed}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        aria-label={copy.save}
                        onClick={() => void commitRename(device.id)}
                        className="grid size-7 place-items-center rounded-sm text-success-primary hover:bg-surface-2"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={copy.cancel}
                        onClick={() => setEditingId(null)}
                        className="grid size-7 place-items-center rounded-sm text-tertiary hover:bg-surface-2"
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {onRename && (
                        <button
                          type="button"
                          aria-label={copy.rename}
                          onClick={() => startRename(device)}
                          className="grid size-7 place-items-center rounded-sm text-tertiary hover:bg-surface-2 hover:text-primary"
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          aria-label={copy.remove}
                          onClick={() => void onDelete(device.id)}
                          className={cn(
                            "grid size-7 place-items-center rounded-sm text-tertiary hover:bg-danger-subtle hover:text-danger-primary"
                          )}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {footer}
    </div>
  );
}
