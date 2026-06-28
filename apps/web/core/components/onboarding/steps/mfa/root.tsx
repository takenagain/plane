/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EOnboardingSteps } from "@plane/types";
// components
import { TwoFactorSetupContainer } from "@/components/account/two-factor/setup-container";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
// local imports
import { CommonOnboardingHeader } from "../common";

type Props = {
  handleStepChange: (step: EOnboardingSteps, skipInvites?: boolean) => void;
};

/**
 * Final, "Secure your account" onboarding step (R5, variant="onboarding"). When the
 * instance enforces 2FA the step is non-skippable; otherwise the user may skip it
 * (the forced gate still applies if the backend later requires it).
 */
export const MfaSetupStep = observer(function MfaSetupStep({ handleStepChange }: Props) {
  const { t } = useTranslation();
  const { config: instanceConfig } = useInstance();

  const isEnforced = Boolean(instanceConfig?.is_mfa_enforced);

  const handleContinue = () => handleStepChange(EOnboardingSteps.MFA_SETUP);

  return (
    <div className="flex flex-col gap-10">
      <CommonOnboardingHeader
        title={t("auth.two_factor.onboarding.title")}
        description={t("auth.two_factor.onboarding.subtitle")}
      />

      <TwoFactorSetupContainer variant="onboarding" onComplete={handleContinue} />

      {!isEnforced && (
        <Button variant="ghost" onClick={handleContinue} className="w-full" size="xl">
          {t("auth.two_factor.onboarding.skip")}
        </Button>
      )}
    </div>
  );
});
