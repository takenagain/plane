/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import type { TMfaMethod } from "@plane/types";
import { TwoFactorVerify } from "@plane/ui";
// hooks
import { useUser } from "@/hooks/store/user";

const LOGIN_AVAILABLE_METHODS: TMfaMethod[] = ["passkey", "security_key", "totp"];

type Props = {
  /** Set when the backend signals hardware-key-only login (`?mfa=lockdown` / `?lockdown=1`). */
  lockdown?: boolean;
};

/**
 * Login-flow MFA challenge (EAuthSteps.MFA_VERIFY). The user is in a partial-auth
 * session; these `auth/mfa/*` endpoints finalize the login on success and return a
 * redirect target, which we follow with a full-page navigation so the SPA reloads
 * with a complete session (R11–R13). Under lockdown only WebAuthn is offered (R4).
 */
export const MfaVerifyForm = observer(function MfaVerifyForm({ lockdown = false }: Props) {
  const { mfa } = useUser();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next_path");

  // In the partial session we can't enumerate the user's factors, so we offer all
  // non-lockdown methods and let the backend reject anything not enrolled.
  const availableMethods = LOGIN_AVAILABLE_METHODS;

  const redirect = (target?: string) => {
    const destination = target || nextPath || "/";
    window.location.replace(destination);
  };

  return (
    <TwoFactorVerify
      availableMethods={availableMethods}
      lockdown={lockdown}
      verifyTotp={async (code) => {
        const result = await mfa.verifyChallenge({ code });
        redirect(result?.redirect);
      }}
      verifyRecoveryCode={async (recoveryCode) => {
        const result = await mfa.verifyChallenge({ recovery_code: recoveryCode });
        redirect(result?.redirect);
      }}
      getAuthenticationOptions={() => mfa.webauthnAuthenticateBegin()}
      completeWebauthnAuthentication={async (response) => {
        const result = await mfa.webauthnAuthenticateComplete(response);
        redirect(result?.redirect);
      }}
      labels={{
        title: t("auth.two_factor.verify.title"),
        totpLabel: t("auth.two_factor.verify.totp_label"),
        totpVerify: t("auth.two_factor.verify.verify"),
        webauthnCta: t("auth.two_factor.verify.webauthn_cta"),
        useRecoveryCode: t("auth.two_factor.verify.use_recovery_code"),
        recoveryLabel: t("auth.two_factor.verify.recovery_label"),
        recoveryVerify: t("auth.two_factor.verify.verify"),
        methodTotp: t("auth.two_factor.verify.method_totp"),
        methodWebauthn: t("auth.two_factor.verify.method_webauthn"),
        pending: t("auth.two_factor.verify.pending"),
      }}
    />
  );
});
