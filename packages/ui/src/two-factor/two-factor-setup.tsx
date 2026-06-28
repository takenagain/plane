/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import type { IMfaTotpSetupResponse, TMfaMethod, TWebAuthnAttachment } from "@plane/types";
import { Button } from "../button/button";
import { MethodCard } from "./method-card";
import { RecoveryCodesPanel } from "./recovery-codes";
import { TotpEnroll } from "./totp-enroll";
import { useWebAuthn } from "./use-webauthn";
import { WebAuthnEnroll } from "./webauthn-enroll";

export type TTwoFactorSetupVariant = "onboarding" | "forced" | "settings" | "admin";

type TStep = "pick" | "totp" | "recovery" | "success";

const METHOD_ATTACHMENT: Record<"passkey" | "security_key", TWebAuthnAttachment> = {
  passkey: "platform",
  security_key: "cross-platform",
};

export interface TwoFactorSetupProps {
  variant: TTwoFactorSetupVariant;
  /** Methods to offer; defaults to all three. Disabled cards still render with a reason. */
  allowedMethods?: TMfaMethod[];
  /** TOTP: create the unconfirmed device + provisioning URI. */
  startTotpSetup: () => Promise<IMfaTotpSetupResponse>;
  /** TOTP: confirm the 6-digit code; returns recovery codes when this is the first factor. */
  verifyTotp: (deviceId: string, code: string) => Promise<{ recovery_codes?: string[] }>;
  /** WebAuthn: fetch creation options from register/begin. */
  getWebauthnRegistrationOptions: (attachment: TWebAuthnAttachment) => Promise<PublicKeyCredentialCreationOptionsJSON>;
  /** WebAuthn: send attestation to register/complete; returns recovery codes when first factor. */
  completeWebauthnRegistration: (response: RegistrationResponseJSON) => Promise<{ recovery_codes?: string[] }>;
  /** Called once the user finishes the flow (recovery acknowledged / success). */
  onComplete?: () => void;
  /** Optional cancel/skip. Hidden for the `forced` variant. */
  onCancel?: () => void;
  labels?: Partial<{
    pickTitle: string;
    pickSubtitle: string;
    back: string;
    cancel: string;
    successTitle: string;
    successSubtitle: string;
    done: string;
  }>;
}

const DEFAULT_ALLOWED_METHODS: TMfaMethod[] = ["passkey", "security_key", "totp"];

const DEFAULT_LABELS = {
  pickTitle: "Secure your account",
  pickSubtitle: "Add a second step to sign in. We'll only ask for it on a new device.",
  back: "Back",
  cancel: "Not now",
  successTitle: "Two-factor authentication is on",
  successSubtitle: "Your account is now protected with a second step at sign-in.",
  done: "Done",
};

export function TwoFactorSetup({
  variant,
  allowedMethods = DEFAULT_ALLOWED_METHODS,
  startTotpSetup,
  verifyTotp,
  getWebauthnRegistrationOptions,
  completeWebauthnRegistration,
  onComplete,
  onCancel,
  labels,
}: TwoFactorSetupProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const { isSupported, isPlatformAuthenticatorAvailable } = useWebAuthn();

  const [step, setStep] = useState<TStep>("pick");
  const [selectedMethod, setSelectedMethod] = useState<TMfaMethod | null>(null);
  const [totpData, setTotpData] = useState<IMfaTotpSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [totpError, setTotpError] = useState<string | undefined>(undefined);
  const [isWorking, setIsWorking] = useState(false);

  const showCancel = variant !== "forced" && Boolean(onCancel);

  const recommendedMethod: TMfaMethod = useMemo(() => {
    if (allowedMethods.includes("passkey") && isSupported && isPlatformAuthenticatorAvailable) return "passkey";
    return "totp";
  }, [allowedMethods, isSupported, isPlatformAuthenticatorAvailable]);

  const handlePick = async (method: TMfaMethod) => {
    setSelectedMethod(method);
    setTotpError(undefined);
    if (method === "totp") {
      setIsWorking(true);
      try {
        const data = await startTotpSetup();
        setTotpData(data);
        setStep("totp");
      } finally {
        setIsWorking(false);
      }
    }
    // WebAuthn methods enroll inline on the pick step via <WebAuthnEnroll />.
  };

  const finishWithRecovery = (codes?: string[]) => {
    if (codes && codes.length > 0) {
      setRecoveryCodes(codes);
      setStep("recovery");
    } else {
      setStep("success");
    }
  };

  const handleTotpVerify = async (code: string) => {
    if (!totpData) return;
    setTotpError(undefined);
    try {
      const result = await verifyTotp(totpData.device_id, code);
      finishWithRecovery(result.recovery_codes);
    } catch (err) {
      const message =
        (err as { error_message?: string; message?: string })?.error_message ??
        (err as { message?: string })?.message ??
        "That code didn't work. Please try again.";
      setTotpError(message);
    }
  };

  const handleWebauthnComplete = async (response: RegistrationResponseJSON) => {
    const result = await completeWebauthnRegistration(response);
    finishWithRecovery(result.recovery_codes);
  };

  const resetToPick = () => {
    setStep("pick");
    setSelectedMethod(null);
    setTotpData(null);
    setTotpError(undefined);
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {step === "pick" && (
        <>
          <Header title={copy.pickTitle} subtitle={copy.pickSubtitle} />
          <div role="radiogroup" aria-label={copy.pickTitle} className="flex flex-col gap-2">
            {allowedMethods.map((method) => {
              const isWebauthn = method === "passkey" || method === "security_key";
              const disabled = isWebauthn && !isSupported;
              return (
                <MethodCard
                  key={method}
                  type={method}
                  recommended={method === recommendedMethod}
                  selected={selectedMethod === method}
                  disabled={disabled}
                  disabledReason={disabled ? "Not supported in this browser" : undefined}
                  onSelect={handlePick}
                />
              );
            })}
          </div>

          {selectedMethod && selectedMethod !== "totp" && isSupported && (
            <WebAuthnEnroll
              attachment={METHOD_ATTACHMENT[selectedMethod as "passkey" | "security_key"]}
              getRegistrationOptions={getWebauthnRegistrationOptions}
              onComplete={handleWebauthnComplete}
            />
          )}

          {showCancel && (
            <button type="button" onClick={onCancel} className="text-12 text-tertiary hover:text-secondary">
              {copy.cancel}
            </button>
          )}
        </>
      )}

      {step === "totp" && totpData && (
        <>
          <BackHeader label={copy.back} onBack={resetToPick} />
          <TotpEnroll
            otpauthUri={totpData.otpauth_uri}
            secret={totpData.secret}
            onVerify={handleTotpVerify}
            error={totpError}
            isVerifying={isWorking}
          />
        </>
      )}

      {step === "recovery" && (
        <RecoveryCodesPanel codes={recoveryCodes} requireConfirmation onConfirm={() => setStep("success")} />
      )}

      {step === "success" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success-primary/10 text-success-primary">
            <ShieldCheck className="size-6" />
          </span>
          <Header title={copy.successTitle} subtitle={copy.successSubtitle} center />
          <Button type="button" variant="primary" size="lg" className="w-full" onClick={onComplete}>
            {copy.done}
          </Button>
        </div>
      )}
    </div>
  );
}

function Header({ title, subtitle, center = false }: { title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={center ? "flex flex-col items-center gap-1 text-center" : "flex flex-col gap-1"}>
      <h2 className="text-18 font-semibold text-primary">{title}</h2>
      {subtitle && <p className="text-13 text-tertiary">{subtitle}</p>}
    </div>
  );
}

function BackHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex w-fit items-center gap-1 text-12 font-medium text-tertiary hover:text-secondary"
    >
      <ChevronLeft className="size-4" />
      {label}
    </button>
  );
}
