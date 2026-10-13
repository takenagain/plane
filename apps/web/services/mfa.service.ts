/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { API_BASE_URL } from "@plane/constants";
import type {
  IMfaDevice,
  IMfaRecoveryCodesResponse,
  IMfaStatus,
  IMfaStepUpResponse,
  IMfaTotpSetupResponse,
  TWebAuthnAttachment,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/** Response of `totp/verify/` and `webauthn/register/complete/` (recovery codes only on first factor). */
type TMfaEnableResponse = { recovery_codes?: string[]; device?: IMfaDevice };

/**
 * Calls the local 2FA/MFA endpoints. Login-flow endpoints (`auth/mfa/*`) operate
 * on the partial-auth session; management endpoints (`api/users/me/mfa/*`) are
 * session-authenticated and send `X-CSRFTOKEN` for unsafe methods.
 *
 * WebAuthn JSON shapes are passed through verbatim to pair with the server
 * `py_webauthn` library — the SPA never reshapes them.
 */
export class MfaService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private async csrfHeaders(): Promise<Record<string, string>> {
    const data = await this.get("/auth/get-csrf-token/").then((response) => response?.data);
    const token = data?.csrf_token;
    if (!token) throw new Error("CSRF token not found");
    return { "X-CSRFTOKEN": token };
  }

  /* ----------------------------- Management ----------------------------- */

  getStatus = async (): Promise<IMfaStatus> =>
    this.get("/api/users/me/mfa/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });

  listDevices = async (): Promise<IMfaDevice[]> =>
    this.get("/api/users/me/mfa/devices/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });

  setupTotp = async (name?: string): Promise<IMfaTotpSetupResponse> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/totp/setup/", { name }, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  verifyTotp = async (deviceId: string, code: string): Promise<TMfaEnableResponse> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/totp/verify/", { device_id: deviceId, code }, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  webauthnRegisterBegin = async (
    attachment: TWebAuthnAttachment,
    name?: string
  ): Promise<PublicKeyCredentialCreationOptionsJSON> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/webauthn/register/begin/", { attachment, name }, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  webauthnRegisterComplete = async (response: RegistrationResponseJSON): Promise<TMfaEnableResponse> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/webauthn/register/complete/", response, { headers })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  renameDevice = async (deviceId: string, name: string): Promise<IMfaDevice> => {
    const headers = await this.csrfHeaders();
    return this.patch(`/api/users/me/mfa/devices/${deviceId}/`, { name }, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  deleteDevice = async (deviceId: string): Promise<void> => {
    const headers = await this.csrfHeaders();
    return this.delete(`/api/users/me/mfa/devices/${deviceId}/`, undefined, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  regenerateRecoveryCodes = async (): Promise<IMfaRecoveryCodesResponse> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/recovery-codes/regenerate/", {}, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  toggleLockdown = async (enable: boolean): Promise<IMfaStatus> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/lockdown/", { enable }, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  stepUp = async (password?: string): Promise<IMfaStepUpResponse> => {
    const headers = await this.csrfHeaders();
    return this.post("/api/users/me/mfa/step-up/", { password }, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  /* ---------------------------- Login flow ------------------------------ */

  verifyChallenge = async (payload: {
    code?: string;
    recovery_code?: string;
  }): Promise<{ success?: boolean; redirect?: string }> => {
    const headers = await this.csrfHeaders();
    return this.post("/auth/mfa/verify/", payload, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  webauthnAuthenticateBegin = async (): Promise<PublicKeyCredentialRequestOptionsJSON> => {
    const headers = await this.csrfHeaders();
    return this.post("/auth/mfa/webauthn/authenticate/begin/", {}, { headers })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };

  webauthnAuthenticateComplete = async (
    response: AuthenticationResponseJSON
  ): Promise<{ success?: boolean; redirect?: string }> => {
    const headers = await this.csrfHeaders();
    return this.post("/auth/mfa/webauthn/authenticate/complete/", response, { headers })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  };
}
