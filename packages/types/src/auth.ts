/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TEmailCheckTypes = "magic_code" | "password";

export interface IEmailCheckData {
  email: string;
}

export interface IEmailCheckResponse {
  status: "MAGIC_CODE" | "CREDENTIAL";
  existing: boolean;
  is_password_autoset: boolean;
}

export interface ILoginTokenResponse {
  access_token: string;
  refresh_token: string;
}

export interface IMagicSignInData {
  email: string;
  key: string;
  token: string;
}

export interface IPasswordSignInData {
  email: string;
  password: string;
}

export interface ICsrfTokenData {
  csrf_token: string;
}

/* -------------------------------------------------------------------------- */
/*                          Two-factor / MFA contract                         */
/* -------------------------------------------------------------------------- */

/**
 * UI-facing method identifiers. The backend persists WebAuthn credentials as a
 * single `WEBAUTHN` device type and resolves the passkey vs security-key
 * distinction server-side; the frontend uses these identifiers only to drive
 * the method picker and the WebAuthn `authenticatorAttachment`.
 */
export type TMfaMethod = "totp" | "passkey" | "security_key";

/** Persisted device type as returned by the management API. */
export type TMfaDeviceType = "TOTP" | "WEBAUTHN";

/** WebAuthn authenticator attachment steered per method. */
export type TWebAuthnAttachment = "platform" | "cross-platform";

/** A single enrolled factor (TOTP secret or WebAuthn credential). */
export interface IMfaDevice {
  id: string;
  device_type: TMfaDeviceType;
  name: string;
  is_confirmed: boolean;
  transports: string[];
  attachment: TWebAuthnAttachment | "";
  aaguid: string;
  device_class: string;
  backed_up: boolean;
  /** Resolved server-side (R3); counts toward the lockdown threshold (R4). */
  is_hardware_security_key: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Response of `GET /api/users/me/mfa/` (UserMFASerializer). */
export interface IMfaStatus {
  is_enabled: boolean;
  /** Lockdown flag (`UserMFA.is_enforced`). */
  is_enforced: boolean;
  enabled_at: string | null;
  last_verified_at: string | null;
  step_up_at: string | null;
  devices: IMfaDevice[];
  /** Count of confirmed hardware security keys (drives lockdown eligibility). */
  hardware_security_key_count: number;
  /** True when the user has >= 2 confirmed hardware security keys. */
  is_lockdown_eligible: boolean;
}

/** Response of `POST /api/users/me/mfa/totp/setup/`. */
export interface IMfaTotpSetupResponse {
  otpauth_uri: string;
  secret: string;
  device_id: string;
}

/** Payload for `POST /api/users/me/mfa/totp/verify/`. */
export interface IMfaTotpVerifyPayload {
  device_id: string;
  code: string;
}

/** Recovery codes are returned once, on first factor confirmation / regenerate. */
export interface IMfaRecoveryCodesResponse {
  recovery_codes: string[];
}

/** Payload for `POST /api/users/me/mfa/webauthn/register/begin/`. */
export interface IMfaWebauthnRegisterBeginPayload {
  attachment: TWebAuthnAttachment;
  name?: string;
}

/** Payload for `POST /api/users/me/mfa/lockdown/`. */
export interface IMfaLockdownPayload {
  enable: boolean;
}

/** Payload for `POST /api/users/me/mfa/step-up/`. */
export interface IMfaStepUpPayload {
  password?: string;
}

/** Response of `POST /api/users/me/mfa/step-up/`. */
export interface IMfaStepUpResponse {
  step_up_at: string;
}

/**
 * Login-time challenge descriptor. Derived by the SPA from the methods the user
 * has actually enrolled plus the lockdown flag (honored server-side too).
 */
export interface IMfaChallenge {
  available_methods: TMfaMethod[];
  lockdown: boolean;
}

/** Payload for `POST /auth/mfa/verify/` (TOTP code or recovery code). */
export interface IMfaVerifyPayload {
  code?: string;
  recovery_code?: string;
}

/**
 * WebAuthn options JSON is passed through verbatim between the server library
 * (`py_webauthn`) and `@simplewebauthn/browser`; kept loose here so
 * `@plane/types` does not depend on the browser library.
 */
export type TWebAuthnOptionsJSON = Record<string, unknown>;
export type TWebAuthnResponseJSON = Record<string, unknown>;

/** Registration options returned by the WebAuthn register-begin endpoint. */
export interface IWebAuthnRegistrationOptions {
  options: TWebAuthnOptionsJSON;
}
