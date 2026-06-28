/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { LockdownModeToggle, RecoveryCodesPanel, TwoFactorDeviceList } from "@plane/ui";
// components
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
// hooks
import { useUser } from "@/hooks/store/user";
// local
import { TwoFactorSetupContainer } from "./setup-container";

/**
 * Settings device-management section (variant="settings", R7/R9). Lists factors and
 * lets the user add/rename/delete devices, regenerate recovery codes, and toggle
 * hardware-key lockdown (shown only when eligible). Step-up is enforced server-side.
 */
export const TwoFactorSettingsSection = observer(function TwoFactorSettingsSection() {
  const { mfa } = useUser();
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);

  const { isLoading } = useSWR("MFA_STATUS_SETTINGS", () => mfa.fetchStatus(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const errorMessage = (error: unknown, fallback: string): string =>
    (error as { error_message?: string })?.error_message ?? (error as { message?: string })?.message ?? fallback;

  const handleRename = async (deviceId: string, name: string) => {
    try {
      await mfa.renameDevice(deviceId, name);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: errorMessage(error, "Failed to rename device.") });
    }
  };

  const handleDelete = async (deviceId: string) => {
    try {
      await mfa.deleteDevice(deviceId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Removed",
        message: t("auth.two_factor.settings.device_removed"),
      });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: errorMessage(error, "Failed to remove device.") });
    }
  };

  const handleRegenerate = async () => {
    try {
      const codes = await mfa.regenerateRecoveryCodes();
      setRegeneratedCodes(codes);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: errorMessage(error, "Failed to regenerate recovery codes."),
      });
    }
  };

  const handleToggleLockdown = async (enable: boolean) => {
    try {
      await mfa.toggleLockdown(enable);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: errorMessage(error, "Failed to update lockdown mode."),
      });
      throw error;
    }
  };

  return (
    <div className="mt-12 size-full border-t border-subtle pt-10">
      <ProfileSettingsHeading title={t("auth.two_factor.settings.title")} />
      <p className="mt-1 text-13 text-tertiary">{t("auth.two_factor.settings.subtitle")}</p>

      <div className="mt-7 flex flex-col gap-8">
        {isAdding ? (
          <div className="rounded-lg border border-subtle bg-surface-1 p-5">
            <TwoFactorSetupContainer
              variant="settings"
              onComplete={() => setIsAdding(false)}
              onCancel={() => setIsAdding(false)}
            />
          </div>
        ) : (
          <>
            {isLoading && !mfa.status ? (
              <p className="text-13 text-tertiary">{t("common.loading")}</p>
            ) : (
              <TwoFactorDeviceList
                devices={mfa.devices}
                onAddMethod={() => setIsAdding(true)}
                onRename={handleRename}
                onDelete={handleDelete}
                footer={
                  <LockdownModeToggle
                    eligible={mfa.isLockdownEligible}
                    enabled={mfa.isLockdownEnabled}
                    onToggle={handleToggleLockdown}
                    labels={{
                      title: t("auth.two_factor.settings.lockdown.title"),
                      description: t("auth.two_factor.settings.lockdown.description"),
                    }}
                  />
                }
                labels={{
                  title: t("auth.two_factor.settings.devices_title"),
                  empty: t("auth.two_factor.settings.devices_empty"),
                  addMethod: t("auth.two_factor.settings.add_method"),
                }}
              />
            )}

            {mfa.isEnabled && (
              <div className="flex flex-col gap-3">
                {regeneratedCodes ? (
                  <RecoveryCodesPanel
                    codes={regeneratedCodes}
                    labels={{
                      title: t("auth.two_factor.settings.recovery.title"),
                      description: t("auth.two_factor.settings.recovery.description"),
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-4 rounded-md border border-strong bg-surface-1 p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-13 font-medium text-primary">
                        {t("auth.two_factor.settings.recovery.title")}
                      </span>
                      <span className="text-11 text-tertiary">
                        {t("auth.two_factor.settings.recovery.regenerate_hint")}
                      </span>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={handleRegenerate}>
                      {t("auth.two_factor.settings.recovery.regenerate")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
