/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { ForcedTwoFactorSetup } from "@/components/account/two-factor/forced-setup";
// helpers
import { EPageTypes } from "@/helpers/authentication.helper";
// layouts
import DefaultLayout from "@/layouts/default-layout";
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";

function SetupTwoFactorPage() {
  return (
    <DefaultLayout>
      <AuthenticationWrapper pageType={EPageTypes.MFA_SETUP}>
        <ForcedTwoFactorSetup />
      </AuthenticationWrapper>
    </DefaultLayout>
  );
}

export default SetupTwoFactorPage;
