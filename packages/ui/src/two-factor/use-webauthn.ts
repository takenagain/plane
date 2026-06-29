/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  WebAuthnAbortService,
  WebAuthnError,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

export type TWebAuthnErrorCopy = {
  /** Programmatic name mirroring the DOM exception (e.g. "NotAllowedError"). */
  name: string;
  /** Friendly, user-facing message. */
  message: string;
  /** True when the ceremony was aborted by `WebAuthnAbortService` (route change / modal close). */
  silent: boolean;
};

const DEFAULT_ERROR_COPY: Record<string, string> = {
  NotAllowedError: "Setup was cancelled or timed out. Please try again.",
  InvalidStateError: "This device is already registered on your account.",
  ABORT_ERROR: "The request was cancelled.",
  default: "Something went wrong talking to your authenticator. Please try again.",
};

/**
 * Maps a thrown error from a WebAuthn ceremony to friendly, user-facing copy.
 * Ceremony-aborted errors (fired by `WebAuthnAbortService` on route changes) are
 * marked `silent` so callers can swallow them.
 */
export const mapWebAuthnError = (error: unknown): TWebAuthnErrorCopy => {
  if (error instanceof WebAuthnError) {
    // `code` is library-specific; ERROR_CEREMONY_ABORTED is fired on cancelCeremony().
    const isAborted = error.code === "ERROR_CEREMONY_ABORTED" || error.name === "AbortError";
    return {
      name: error.name,
      message: DEFAULT_ERROR_COPY[error.name] ?? error.message ?? DEFAULT_ERROR_COPY.default,
      silent: isAborted,
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message || DEFAULT_ERROR_COPY.default, silent: false };
  }
  return { name: "UnknownError", message: DEFAULT_ERROR_COPY.default, silent: false };
};

export type TUseWebAuthn = {
  /** Whether the current browser supports WebAuthn at all. */
  isSupported: boolean;
  /** Whether a platform authenticator (Touch ID / Face ID / Windows Hello) is available. */
  isPlatformAuthenticatorAvailable: boolean;
  /** True while a ceremony is awaiting the OS/authenticator prompt. */
  isPending: boolean;
  /** Run the registration ceremony for `optionsJSON` from the server. */
  register: (optionsJSON: PublicKeyCredentialCreationOptionsJSON) => Promise<RegistrationResponseJSON>;
  /** Run the authentication (assertion) ceremony for `optionsJSON` from the server. */
  authenticate: (optionsJSON: PublicKeyCredentialRequestOptionsJSON) => Promise<AuthenticationResponseJSON>;
  /** Cancel an in-flight ceremony (e.g. on modal close / route change). */
  cancel: () => void;
};

/**
 * Centralizes WebAuthn capability detection and ceremony execution for the 2FA
 * components. The request/response JSON shapes are passed through verbatim to
 * pair 1:1 with the server `py_webauthn` library.
 */
export const useWebAuthn = (): TUseWebAuthn => {
  const [isPlatformAuthenticatorAvailable, setIsPlatformAuthenticatorAvailable] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const isSupported = typeof window !== "undefined" && browserSupportsWebAuthn();

  useEffect(() => {
    let isMounted = true;
    if (isSupported) {
      void platformAuthenticatorIsAvailable().then((available) => {
        if (isMounted) setIsPlatformAuthenticatorAvailable(available);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isSupported]);

  const register = useCallback(async (optionsJSON: PublicKeyCredentialCreationOptionsJSON) => {
    setIsPending(true);
    try {
      return await startRegistration({ optionsJSON });
    } finally {
      setIsPending(false);
    }
  }, []);

  const authenticate = useCallback(async (optionsJSON: PublicKeyCredentialRequestOptionsJSON) => {
    setIsPending(true);
    try {
      return await startAuthentication({ optionsJSON });
    } finally {
      setIsPending(false);
    }
  }, []);

  const cancel = useCallback(() => {
    WebAuthnAbortService.cancelCeremony();
    setIsPending(false);
  }, []);

  // Abort any in-flight ceremony if the consumer unmounts.
  useEffect(
    () => () => {
      WebAuthnAbortService.cancelCeremony();
    },
    []
  );

  return {
    isSupported,
    isPlatformAuthenticatorAvailable,
    isPending,
    register,
    authenticate,
    cancel,
  };
};
