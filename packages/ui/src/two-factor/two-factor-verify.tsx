/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import type { TMfaMethod } from "@plane/types";
import { Button } from "../button/button";
import { Spinner } from "../spinners/circular-spinner";
import { cn } from "../utils";
import { mapWebAuthnError, useWebAuthn } from "./use-webauthn";

export interface TwoFactorVerifyProps {
  /** The methods the user has actually enrolled. */
  availableMethods: TMfaMethod[];
  /** When true, only hardware security keys are accepted; everything else is hidden (R4). */
  lockdown: boolean;
  /** Verify a 6-digit TOTP code. Should throw on an invalid code. */
  verifyTotp: (code: string) => Promise<void>;
  /** Verify a single-use recovery code. Should throw on an invalid code. */
  verifyRecoveryCode: (code: string) => Promise<void>;
  /** Fetch assertion options (authenticate/begin); server filters allowCredentials under lockdown. */
  getAuthenticationOptions: () => Promise<PublicKeyCredentialRequestOptionsJSON>;
  /** Send the assertion to authenticate/complete. Should throw on failure. */
  completeWebauthnAuthentication: (response: AuthenticationResponseJSON) => Promise<void>;
  /** External error (e.g. invalid code from the server). */
  error?: string;
  labels?: Partial<{
    title: string;
    totpLabel: string;
    totpVerify: string;
    webauthnCta: string;
    useAnotherMethod: string;
    useRecoveryCode: string;
    recoveryLabel: string;
    recoveryVerify: string;
    methodTotp: string;
    methodWebauthn: string;
    pending: string;
  }>;
}

const DEFAULT_LABELS = {
  title: "Two-step verification",
  totpLabel: "Enter the 6-digit code from your authenticator app",
  totpVerify: "Verify",
  webauthnCta: "Use your passkey or security key",
  useAnotherMethod: "Use another method",
  useRecoveryCode: "Use a recovery code",
  recoveryLabel: "Enter a recovery code",
  recoveryVerify: "Verify",
  methodTotp: "Authenticator app",
  methodWebauthn: "Passkey / security key",
  pending: "Waiting for your device…",
};

type TActiveView = "totp" | "webauthn" | "recovery";

export function TwoFactorVerify({
  availableMethods,
  lockdown,
  verifyTotp,
  verifyRecoveryCode,
  getAuthenticationOptions,
  completeWebauthnAuthentication,
  error,
  labels,
}: TwoFactorVerifyProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const { authenticate, isPending } = useWebAuthn();

  // Under lockdown only WebAuthn (hardware security key) is permitted.
  const methods = useMemo<TMfaMethod[]>(() => {
    if (lockdown) return ["security_key"];
    return availableMethods;
  }, [availableMethods, lockdown]);

  const hasWebauthn = methods.includes("passkey") || methods.includes("security_key");
  const hasTotp = !lockdown && methods.includes("totp");

  const initialView: TActiveView = hasWebauthn ? "webauthn" : "totp";
  const [view, setView] = useState<TActiveView>(initialView);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmittedRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalError(undefined);
  }, [view]);

  const shownError = localError ?? error;

  const runWebauthn = async () => {
    setLocalError(undefined);
    try {
      const optionsJSON = await getAuthenticationOptions();
      const assertion = await authenticate(optionsJSON);
      await completeWebauthnAuthentication(assertion);
    } catch (err) {
      const mapped = mapWebAuthnError(err);
      if (!mapped.silent) setLocalError(mapped.message);
    }
  };

  const submitTotp = async (value: string) => {
    if (value.length !== 6 || isSubmitting) return;
    autoSubmittedRef.current = value;
    setIsSubmitting(true);
    setLocalError(undefined);
    try {
      await verifyTotp(value);
    } catch (err) {
      setLocalError(resolveMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (view === "totp" && code.length === 6 && autoSubmittedRef.current !== code && !isSubmitting) {
      void submitTotp(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, view]);

  const submitRecovery = async () => {
    if (!recovery.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setLocalError(undefined);
    try {
      await verifyRecoveryCode(recovery.trim());
    } catch (err) {
      setLocalError(resolveMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <h2 className="text-18 font-semibold text-primary">{copy.title}</h2>

      {view === "webauthn" && (
        <div className="flex flex-col gap-3">
          {isPending ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-strong bg-surface-1 p-6">
              <Spinner height="28px" width="28px" />
              <p className="text-13 text-secondary" aria-live="polite">
                {copy.pending}
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              onClick={runWebauthn}
              prependIcon={lockdown ? <KeyRound /> : <Fingerprint />}
            >
              {copy.webauthnCta}
            </Button>
          )}
        </div>
      )}

      {view === "totp" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfa-totp" className="text-13 font-medium text-tertiary">
            {copy.totpLabel}
          </label>
          <input
            id="mfa-totp"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            aria-invalid={Boolean(shownError)}
            aria-describedby={shownError ? "mfa-error" : undefined}
            className={cn(
              "font-mono text-15 placeholder:tracking-normal focus-visible:ring-accent-primary h-10 w-full rounded-md border bg-surface-1 px-3 tracking-[0.4em] text-primary placeholder:text-placeholder focus:outline-none focus-visible:ring-2",
              shownError ? "border-danger-strong" : "border-strong"
            )}
            placeholder="123456"
          />
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="mt-2 w-full"
            disabled={code.length !== 6 || isSubmitting}
            onClick={() => void submitTotp(code)}
          >
            {isSubmitting ? <Spinner height="20px" width="20px" /> : copy.totpVerify}
          </Button>
        </div>
      )}

      {view === "recovery" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfa-recovery" className="text-13 font-medium text-tertiary">
            {copy.recoveryLabel}
          </label>
          <input
            id="mfa-recovery"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            autoFocus
            aria-invalid={Boolean(shownError)}
            aria-describedby={shownError ? "mfa-error" : undefined}
            className={cn(
              "font-mono focus-visible:ring-accent-primary h-10 w-full rounded-md border bg-surface-1 px-3 text-14 text-primary placeholder:text-placeholder focus:outline-none focus-visible:ring-2",
              shownError ? "border-danger-strong" : "border-strong"
            )}
            placeholder="xxxx-xxxx"
          />
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="mt-2 w-full"
            disabled={!recovery.trim() || isSubmitting}
            onClick={() => void submitRecovery()}
          >
            {isSubmitting ? <Spinner height="20px" width="20px" /> : copy.recoveryVerify}
          </Button>
        </div>
      )}

      {shownError && (
        <span id="mfa-error" role="alert" className="text-11 text-danger-primary">
          {shownError}
        </span>
      )}

      {/* Method switcher: lists only enrolled methods; hidden entirely under lockdown. */}
      {!lockdown && (
        <div className="flex flex-col gap-2 border-t border-subtle pt-3">
          {hasWebauthn && view !== "webauthn" && (
            <MethodSwitchButton label={copy.methodWebauthn} onClick={() => setView("webauthn")} />
          )}
          {hasTotp && view !== "totp" && <MethodSwitchButton label={copy.methodTotp} onClick={() => setView("totp")} />}
          {view !== "recovery" && (
            <button
              type="button"
              onClick={() => setView("recovery")}
              className="text-12 text-tertiary hover:text-secondary"
            >
              {copy.useRecoveryCode}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MethodSwitchButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-12 font-medium text-accent-primary hover:text-accent-secondary"
    >
      {label}
    </button>
  );
}

const resolveMessage = (err: unknown): string =>
  (err as { error_message?: string })?.error_message ??
  (err as { message?: string })?.message ??
  "That code didn't work. Please try again.";
