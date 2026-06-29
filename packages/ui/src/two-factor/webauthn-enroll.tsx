/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useState } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import type { TWebAuthnAttachment } from "@plane/types";
import { Button } from "../button/button";
import { Spinner } from "../spinners/circular-spinner";
import { mapWebAuthnError, useWebAuthn } from "./use-webauthn";

export interface WebAuthnEnrollProps {
  attachment: TWebAuthnAttachment;
  /** Fetch registration options from the server (register/begin). */
  getRegistrationOptions: (attachment: TWebAuthnAttachment) => Promise<PublicKeyCredentialCreationOptionsJSON>;
  /** Send the attestation back to the server (register/complete). Should throw on failure. */
  onComplete: (response: RegistrationResponseJSON) => Promise<void>;
  labels?: Partial<{
    passkeyCta: string;
    securityKeyCta: string;
    pending: string;
    cancel: string;
    unsupported: string;
  }>;
}

const DEFAULT_LABELS = {
  passkeyCta: "Set up passkey",
  securityKeyCta: "Set up security key",
  pending: "Waiting for your device…",
  cancel: "Cancel",
  unsupported: "This browser doesn't support passkeys or security keys. Use an authenticator app instead.",
};

export function WebAuthnEnroll({ attachment, getRegistrationOptions, onComplete, labels }: WebAuthnEnrollProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const { isSupported, isPending, register, cancel } = useWebAuthn();
  const [error, setError] = useState<string | undefined>(undefined);

  const isPasskey = attachment === "platform";

  const handleEnroll = async () => {
    setError(undefined);
    try {
      const optionsJSON = await getRegistrationOptions(attachment);
      const attResp = await register(optionsJSON);
      await onComplete(attResp);
    } catch (err) {
      const mapped = mapWebAuthnError(err);
      if (!mapped.silent) setError(mapped.message);
    }
  };

  if (!isSupported) {
    return (
      <div role="alert" className="rounded-md border border-strong bg-surface-1 p-3 text-13 text-tertiary">
        {copy.unsupported}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isPending ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-strong bg-surface-1 p-6">
          <Spinner height="28px" width="28px" />
          <p className="text-13 text-secondary" aria-live="polite">
            {copy.pending}
          </p>
          <Button type="button" variant="neutral-primary" size="sm" onClick={cancel}>
            {copy.cancel}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleEnroll}
          prependIcon={isPasskey ? <Fingerprint /> : <KeyRound />}
        >
          {isPasskey ? copy.passkeyCta : copy.securityKeyCta}
        </Button>
      )}
      {error && (
        <span role="alert" className="text-11 text-danger-primary">
          {error}
        </span>
      )}
    </div>
  );
}
