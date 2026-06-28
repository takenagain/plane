/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// hooks
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local
import { TwoFactorSetupContainer } from "./setup-container";

/**
 * Full-page forced-setup gate (variant="forced"). The user is blocked from the
 * app shell until a factor is confirmed (R6); there is no skip/dismiss. Once 2FA
 * is enabled we route the user back into the workspace.
 */
export const ForcedTwoFactorSetup = observer(function ForcedTwoFactorSetup() {
  const { mfa } = useUser();
  const { t } = useTranslation();
  const router = useAppRouter();

  const { isLoading } = useSWR("MFA_STATUS", () => mfa.fetchStatus(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  // If 2FA is already enabled (e.g. set up elsewhere), leave the gate.
  useEffect(() => {
    if (mfa.status?.is_enabled) {
      mfa.setForcedSetupRequired(false);
      router.replace("/");
    }
  }, [mfa.status?.is_enabled, mfa, router]);

  const handleComplete = () => {
    mfa.setForcedSetupRequired(false);
    router.replace("/");
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-canvas p-4">
      <div className="shadow-md w-full max-w-[26rem] rounded-lg border border-subtle bg-surface-1 p-6">
        <div className="mb-4 flex flex-col gap-1">
          <h1 className="text-15 font-semibold text-primary">{t("auth.two_factor.forced.title")}</h1>
          <p className="text-13 text-tertiary">{t("auth.two_factor.forced.subtitle")}</p>
        </div>
        {isLoading && !mfa.status ? (
          <div className="grid h-40 w-full place-items-center">
            <LogoSpinner />
          </div>
        ) : (
          <TwoFactorSetupContainer variant="forced" onComplete={handleComplete} />
        )}
      </div>
    </div>
  );
});
