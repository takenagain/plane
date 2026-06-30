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
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import type { IMfaDevice, IMfaStatus, IMfaTotpSetupResponse, TMfaMethod, TWebAuthnAttachment } from "@plane/types";
// services
import { MfaService } from "@/services/mfa.service";

type TMfaError = {
  status: string;
  message: string;
};

export interface IMfaStore {
  // observables
  isLoading: boolean;
  error: TMfaError | undefined;
  status: IMfaStatus | undefined;
  /** Set by the 403 `MFA_SETUP_REQUIRED` interceptor / `users/me` flag; drives the forced gate. */
  forcedSetupRequired: boolean;
  // computed
  isEnabled: boolean;
  isLockdownEnabled: boolean;
  isLockdownEligible: boolean;
  hardwareSecurityKeyCount: number;
  devices: IMfaDevice[];
  availableMethods: TMfaMethod[];
  setupRequired: boolean;
  // actions
  fetchStatus: () => Promise<IMfaStatus | undefined>;
  setupTotp: (name?: string) => Promise<IMfaTotpSetupResponse>;
  verifyTotp: (deviceId: string, code: string) => Promise<{ recovery_codes?: string[] }>;
  webauthnRegisterBegin: (
    attachment: TWebAuthnAttachment,
    name?: string
  ) => Promise<PublicKeyCredentialCreationOptionsJSON>;
  webauthnRegisterComplete: (response: RegistrationResponseJSON) => Promise<{ recovery_codes?: string[] }>;
  renameDevice: (deviceId: string, name: string) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;
  regenerateRecoveryCodes: () => Promise<string[]>;
  toggleLockdown: (enable: boolean) => Promise<void>;
  stepUp: (password?: string) => Promise<void>;
  // login-flow
  webauthnAuthenticateBegin: () => Promise<PublicKeyCredentialRequestOptionsJSON>;
  webauthnAuthenticateComplete: (response: AuthenticationResponseJSON) => Promise<{ redirect?: string }>;
  verifyChallenge: (payload: { code?: string; recovery_code?: string }) => Promise<{ redirect?: string }>;
  // helpers
  setForcedSetupRequired: (value: boolean) => void;
  reset: () => void;
}

export class MfaStore implements IMfaStore {
  // observables
  isLoading: boolean = false;
  error: TMfaError | undefined = undefined;
  status: IMfaStatus | undefined = undefined;
  forcedSetupRequired: boolean = false;
  // service
  mfaService: MfaService;

  constructor() {
    this.mfaService = new MfaService();
    makeObservable(this, {
      // observables
      isLoading: observable.ref,
      error: observable,
      status: observable,
      forcedSetupRequired: observable.ref,
      // computed
      isEnabled: computed,
      isLockdownEnabled: computed,
      isLockdownEligible: computed,
      hardwareSecurityKeyCount: computed,
      devices: computed,
      availableMethods: computed,
      setupRequired: computed,
      // actions
      fetchStatus: action,
      setupTotp: action,
      verifyTotp: action,
      webauthnRegisterBegin: action,
      webauthnRegisterComplete: action,
      renameDevice: action,
      deleteDevice: action,
      regenerateRecoveryCodes: action,
      toggleLockdown: action,
      stepUp: action,
      verifyChallenge: action,
      webauthnAuthenticateBegin: action,
      webauthnAuthenticateComplete: action,
      setForcedSetupRequired: action,
      reset: action,
    });
  }

  // computed
  get isEnabled() {
    return this.status?.is_enabled ?? false;
  }

  get isLockdownEnabled() {
    return this.status?.is_enforced ?? false;
  }

  get isLockdownEligible() {
    return this.status?.is_lockdown_eligible ?? false;
  }

  get hardwareSecurityKeyCount() {
    return this.status?.hardware_security_key_count ?? 0;
  }

  get devices() {
    return this.status?.devices ?? [];
  }

  /** UI-facing methods the user has actually confirmed, used by `<TwoFactorVerify />`. */
  get availableMethods(): TMfaMethod[] {
    const confirmed = this.devices.filter((device) => device.is_confirmed);
    const methods = new Set<TMfaMethod>();
    confirmed.forEach((device) => {
      if (device.device_type === "TOTP") methods.add("totp");
      else if (device.is_hardware_security_key) methods.add("security_key");
      else methods.add("passkey");
    });
    return Array.from(methods);
  }

  /** Drives the forced-setup gate (server flag OR a status fetch showing 2FA isn't enabled). */
  get setupRequired() {
    if (this.forcedSetupRequired) return true;
    if (this.status) return !this.status.is_enabled;
    return false;
  }

  // actions
  fetchStatus = async (): Promise<IMfaStatus | undefined> => {
    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = undefined;
      });
      const status = await this.mfaService.getStatus();
      runInAction(() => {
        this.status = status;
        this.isLoading = false;
      });
      return status;
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
        this.error = { status: "mfa-fetch-error", message: "Failed to fetch MFA status" };
      });
      throw error;
    }
  };

  setupTotp = async (name?: string): Promise<IMfaTotpSetupResponse> => this.mfaService.setupTotp(name);

  verifyTotp = async (deviceId: string, code: string): Promise<{ recovery_codes?: string[] }> => {
    const result = await this.mfaService.verifyTotp(deviceId, code);
    await this.fetchStatus().catch(() => undefined);
    return result;
  };

  webauthnRegisterBegin = async (
    attachment: TWebAuthnAttachment,
    name?: string
  ): Promise<PublicKeyCredentialCreationOptionsJSON> => this.mfaService.webauthnRegisterBegin(attachment, name);

  webauthnRegisterComplete = async (response: RegistrationResponseJSON): Promise<{ recovery_codes?: string[] }> => {
    const result = await this.mfaService.webauthnRegisterComplete(response);
    await this.fetchStatus().catch(() => undefined);
    return result;
  };

  renameDevice = async (deviceId: string, name: string): Promise<void> => {
    const previous = this.status?.devices.map((device) => ({ ...device }));
    // optimistic update
    runInAction(() => {
      if (this.status) {
        this.status.devices = this.status.devices.map((device) =>
          device.id === deviceId ? { ...device, name } : device
        );
      }
    });
    try {
      await this.mfaService.renameDevice(deviceId, name);
    } catch (error) {
      runInAction(() => {
        if (this.status && previous) this.status.devices = previous;
      });
      throw error;
    }
  };

  deleteDevice = async (deviceId: string): Promise<void> => {
    await this.mfaService.deleteDevice(deviceId);
    await this.fetchStatus().catch(() => undefined);
  };

  regenerateRecoveryCodes = async (): Promise<string[]> => {
    const result = await this.mfaService.regenerateRecoveryCodes();
    return result.recovery_codes ?? [];
  };

  toggleLockdown = async (enable: boolean): Promise<void> => {
    const status = await this.mfaService.toggleLockdown(enable);
    runInAction(() => {
      this.status = status;
    });
  };

  stepUp = async (password?: string): Promise<void> => {
    await this.mfaService.stepUp(password);
  };

  // login-flow
  webauthnAuthenticateBegin = async (): Promise<PublicKeyCredentialRequestOptionsJSON> =>
    this.mfaService.webauthnAuthenticateBegin();

  webauthnAuthenticateComplete = async (response: AuthenticationResponseJSON): Promise<{ redirect?: string }> =>
    this.mfaService.webauthnAuthenticateComplete(response);

  verifyChallenge = async (payload: { code?: string; recovery_code?: string }): Promise<{ redirect?: string }> =>
    this.mfaService.verifyChallenge(payload);

  setForcedSetupRequired = (value: boolean): void => {
    runInAction(() => {
      this.forcedSetupRequired = value;
    });
  };

  reset = (): void => {
    runInAction(() => {
      this.isLoading = false;
      this.error = undefined;
      this.status = undefined;
      this.forcedSetupRequired = false;
    });
  };
}
