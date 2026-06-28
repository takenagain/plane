/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TTwoFactorSetupVariant } from "@plane/ui";
import { TwoFactorSetup } from "@plane/ui";
// hooks
import { useUser } from "@/hooks/store/user";

type Props = {
  variant: TTwoFactorSetupVariant;
  onComplete?: () => void;
  onCancel?: () => void;
};

/**
 * Wires the MobX `MfaStore` + `MfaService` into the presentational
 * `<TwoFactorSetup />` wizard from `@plane/ui`. Reused by onboarding, the forced
 * gate, and Settings via the `variant` prop with no logic fork in callers (R7).
 */
export const TwoFactorSetupContainer = observer(function TwoFactorSetupContainer({
  variant,
  onComplete,
  onCancel,
}: Props) {
  const { mfa } = useUser();
  const { t } = useTranslation();

  return (
    <TwoFactorSetup
      variant={variant}
      startTotpSetup={() => mfa.setupTotp()}
      verifyTotp={(deviceId, code) => mfa.verifyTotp(deviceId, code)}
      getWebauthnRegistrationOptions={(attachment) => mfa.webauthnRegisterBegin(attachment)}
      completeWebauthnRegistration={(response) => mfa.webauthnRegisterComplete(response)}
      onComplete={onComplete}
      onCancel={onCancel}
      labels={{
        pickTitle: t("auth.two_factor.setup.title"),
        pickSubtitle: t("auth.two_factor.setup.subtitle"),
        back: t("auth.two_factor.setup.back"),
        cancel: t("auth.two_factor.setup.cancel"),
        successTitle: t("auth.two_factor.setup.success_title"),
        successSubtitle: t("auth.two_factor.setup.success_subtitle"),
        done: t("auth.two_factor.setup.done"),
      }}
    />
  );
});
