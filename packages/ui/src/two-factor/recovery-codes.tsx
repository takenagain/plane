/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";
import { Button } from "../button/button";
import { cn } from "../utils";

export interface RecoveryCodesPanelProps {
  codes: string[];
  /** Require the user to confirm they saved the codes before continuing (wizard step). */
  requireConfirmation?: boolean;
  /** Called when the user continues after confirming they saved the codes. */
  onConfirm?: () => void;
  /** Filename used for the `.txt` download. */
  downloadFilename?: string;
  labels?: Partial<{
    title: string;
    description: string;
    copy: string;
    copied: string;
    download: string;
    print: string;
    confirm: string;
    savedAcknowledgement: string;
  }>;
}

const DEFAULT_LABELS = {
  title: "Save your recovery codes",
  description: "Each code works once. Keep them somewhere safe — they're the only way back in if you lose your device.",
  copy: "Copy all",
  copied: "Copied",
  download: "Download",
  print: "Print",
  confirm: "I've saved my codes",
  savedAcknowledgement: "I have saved these recovery codes in a safe place.",
};

export function RecoveryCodesPanel({
  codes,
  requireConfirmation = false,
  onConfirm,
  downloadFilename = "plane-recovery-codes.txt",
  labels,
}: RecoveryCodesPanelProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [hasCopied, setHasCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const asText = codes.join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // ignore — manual selection still works.
    }
  };

  const handleDownload = () => {
    const blob = new Blob([asText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFilename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=480,height=640");
    if (!win) return;
    win.document.write(`<pre style="font-family:monospace;font-size:16px;line-height:1.8">${asText}</pre>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-15 font-medium text-primary">{copy.title}</h3>
        <p className="text-13 text-tertiary">{copy.description}</p>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-md border border-strong bg-surface-1 p-4">
        {codes.map((code) => (
          <li key={code} className="font-mono text-center text-13 text-primary select-all">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="neutral-primary"
          size="sm"
          onClick={handleCopy}
          prependIcon={hasCopied ? <Check /> : <Copy />}
        >
          {hasCopied ? copy.copied : copy.copy}
        </Button>
        <Button type="button" variant="neutral-primary" size="sm" onClick={handleDownload} prependIcon={<Download />}>
          {copy.download}
        </Button>
        <Button type="button" variant="neutral-primary" size="sm" onClick={handlePrint} prependIcon={<Printer />}>
          {copy.print}
        </Button>
      </div>

      {requireConfirmation && (
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2 text-13 text-secondary">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-primary)]"
            />
            <span>{copy.savedAcknowledgement}</span>
          </label>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className={cn("w-full")}
            disabled={!acknowledged}
            onClick={onConfirm}
          >
            {copy.confirm}
          </Button>
        </div>
      )}
    </div>
  );
}
