/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../button/button";
import { Spinner } from "../spinners/circular-spinner";
import { cn } from "../utils";
import { QRCode } from "./qr-code";

export interface TotpEnrollProps {
  /** Server-provided `otpauth://` provisioning URI. */
  otpauthUri: string;
  /** Base32 secret for manual entry (accessibility / desktop authenticators). */
  secret: string;
  /** Verify the 6-digit code server-side. Should throw on an invalid code. */
  onVerify: (code: string) => Promise<void>;
  /** External error message (e.g. invalid code) announced via `role="alert"`. */
  error?: string;
  isVerifying?: boolean;
  /** Optional copy overrides for i18n. */
  labels?: Partial<{
    scanInstruction: string;
    manualEntry: string;
    secretLabel: string;
    codeLabel: string;
    verify: string;
    copy: string;
    copied: string;
  }>;
}

const DEFAULT_LABELS = {
  scanInstruction: "Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy…).",
  manualEntry: "Can't scan? Enter the code manually",
  secretLabel: "Setup key",
  codeLabel: "Enter the 6-digit code",
  verify: "Verify",
  copy: "Copy",
  copied: "Copied",
};

const chunkSecret = (secret: string): string => (secret.match(/.{1,4}/g) ?? [secret]).join(" ");

export function TotpEnroll({ otpauthUri, secret, onVerify, error, isVerifying = false, labels }: TotpEnrollProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [code, setCode] = useState("");
  const [hasCopied, setHasCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const autoSubmittedRef = useRef<string | null>(null);

  const submit = async (value: string) => {
    if (value.length !== 6 || isVerifying) return;
    autoSubmittedRef.current = value;
    await onVerify(value);
  };

  // Auto-submit once 6 digits are present (TOTP rotates every 30s — minimize latency).
  useEffect(() => {
    if (code.length === 6 && autoSubmittedRef.current !== code && !isVerifying) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // clipboard may be unavailable; manual selection still works.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-13 text-tertiary">{copy.scanInstruction}</p>
      <div className="flex justify-center">
        <QRCode value={otpauthUri} />
      </div>

      <details
        open={showManual}
        onToggle={(e) => setShowManual((e.target as HTMLDetailsElement).open)}
        className="rounded-md border border-strong bg-surface-1"
      >
        <summary className="cursor-pointer px-3 py-2 text-12 font-medium text-secondary select-none">
          {copy.manualEntry}
        </summary>
        <div className="flex flex-col gap-1 px-3 pb-3">
          <span className="text-11 text-tertiary">{copy.secretLabel}</span>
          <div className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
            <code className="font-mono text-13 break-all text-primary select-all">{chunkSecret(secret)}</code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={hasCopied ? copy.copied : copy.copy}
              className="grid size-6 shrink-0 place-items-center text-tertiary hover:text-primary"
            >
              {hasCopied ? <Check className="size-4 text-success-primary" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>
      </details>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="totp-code" className="text-13 font-medium text-tertiary">
          {copy.codeLabel}
        </label>
        <input
          id="totp-code"
          name="totp-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          autoFocus
          aria-describedby={error ? "totp-error" : undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            "font-mono text-15 placeholder:tracking-normal focus-visible:ring-accent-primary h-10 w-full rounded-md border bg-surface-1 px-3 tracking-[0.4em] text-primary placeholder:text-placeholder focus:outline-none focus-visible:ring-2",
            error ? "border-danger-strong" : "border-strong"
          )}
          placeholder="123456"
        />
        {error && (
          <span id="totp-error" role="alert" className="text-11 text-danger-primary">
            {error}
          </span>
        )}
      </div>

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={code.length !== 6 || isVerifying}
        onClick={() => void submit(code)}
      >
        {isVerifying ? <Spinner height="20px" width="20px" /> : copy.verify}
      </Button>
    </div>
  );
}
