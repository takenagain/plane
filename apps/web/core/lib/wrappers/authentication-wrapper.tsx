/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useSearchParams, usePathname } from "next/navigation";
import useSWR from "swr";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// helpers
import { EPageTypes } from "@/helpers/authentication.helper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserProfile, useUserSettings } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

type TPageType = EPageTypes;

type TAuthenticationWrapper = {
  children: ReactNode;
  pageType?: TPageType;
};

const isValidURL = (url: string): boolean => {
  const disallowedSchemes = /^(https?|ftp):\/\//i;
  return !disallowedSchemes.test(url);
};

export const AuthenticationWrapper = observer(function AuthenticationWrapper(props: TAuthenticationWrapper) {
  const pathname = usePathname();
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next_path");
  // props
  const { children, pageType = EPageTypes.AUTHENTICATED } = props;
  // hooks
  const { isLoading: isUserLoading, data: currentUser, fetchCurrentUser, mfa } = useUser();
  const { data: currentUserProfile } = useUserProfile();
  const { data: currentUserSettings } = useUserSettings();
  const { loader: workspacesLoader, workspaces } = useWorkspace();

  const { isLoading: isUserSWRLoading } = useSWR("USER_INFORMATION", async () => await fetchCurrentUser(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const isUserOnboard =
    currentUserProfile?.is_onboarded ||
    (currentUserProfile?.onboarding_step?.profile_complete &&
      currentUserProfile?.onboarding_step?.workspace_create &&
      currentUserProfile?.onboarding_step?.workspace_invite &&
      currentUserProfile?.onboarding_step?.workspace_join) ||
    false;

  // Forced-2FA gate. Source of truth is the backend (403 MFA_SETUP_REQUIRED); the SPA mirrors it
  // via the `users/me` flag and the MfaStore flag set by the axios interceptor (R6).
  // Only the server-authoritative `users/me` flag and the 403-interceptor flag gate the app shell,
  // so instances with MFA disabled/non-enforced are never blocked.
  const MFA_SETUP_ROUTE = "/accounts/setup-2fa";
  const mfaSetupRequired = Boolean(currentUser?.mfa_setup_required) || mfa.forcedSetupRequired;

  const getWorkspaceRedirectionUrl = (): string => {
    let redirectionRoute = "/create-workspace";

    // validating the nextPath from the router query
    if (nextPath && isValidURL(nextPath.toString())) {
      redirectionRoute = nextPath.toString();
      return redirectionRoute;
    }

    // validate the last and fallback workspace_slug
    const currentWorkspaceSlug =
      currentUserSettings?.workspace?.last_workspace_slug || currentUserSettings?.workspace?.fallback_workspace_slug;

    // validate the current workspace_slug is available in the user's workspace list
    const isCurrentWorkspaceValid = Object.values(workspaces || {}).findIndex(
      (workspace) => workspace.slug === currentWorkspaceSlug
    );

    if (isCurrentWorkspaceValid >= 0) redirectionRoute = `/${currentWorkspaceSlug}`;

    return redirectionRoute;
  };

  if ((isUserSWRLoading || isUserLoading || workspacesLoader) && !currentUser?.id)
    return (
      <div className="relative flex h-screen w-full items-center justify-center">
        <LogoSpinner />
      </div>
    );

  if (pageType === EPageTypes.PUBLIC) return <>{children}</>;

  if (pageType === EPageTypes.NON_AUTHENTICATED) {
    if (!currentUser?.id) return <>{children}</>;
    else {
      if (currentUserProfile?.id && isUserOnboard) {
        const currentRedirectRoute = getWorkspaceRedirectionUrl();
        router.push(currentRedirectRoute);
        return <></>;
      } else {
        router.push("/onboarding");
        return <></>;
      }
    }
  }

  if (pageType === EPageTypes.ONBOARDING) {
    if (!currentUser?.id) {
      router.push(`/${pathname ? `?next_path=${pathname}` : ``}`);
      return <></>;
    } else {
      if (currentUser && currentUserProfile?.id && isUserOnboard) {
        const currentRedirectRoute = getWorkspaceRedirectionUrl();
        router.replace(currentRedirectRoute);
        return <></>;
      } else return <>{children}</>;
    }
  }

  if (pageType === EPageTypes.SET_PASSWORD) {
    if (!currentUser?.id) {
      router.push(`/${pathname ? `?next_path=${pathname}` : ``}`);
      return <></>;
    } else {
      if (currentUser && !currentUser?.is_password_autoset && currentUserProfile?.id && isUserOnboard) {
        const currentRedirectRoute = getWorkspaceRedirectionUrl();
        router.push(currentRedirectRoute);
        return <></>;
      } else return <>{children}</>;
    }
  }

  if (pageType === EPageTypes.MFA_SETUP) {
    if (!currentUser?.id) {
      router.push(`/${pathname ? `?next_path=${pathname}` : ``}`);
      return <></>;
    }
    // ForcedTwoFactorSetup owns navigation once the user finishes the wizard (recovery
    // codes + Done). Only bounce away on entry when setup is already satisfied.
    if (!mfaSetupRequired && !mfa.status?.is_enabled) {
      if (currentUserProfile?.id && isUserOnboard) {
        router.replace(getWorkspaceRedirectionUrl());
        return <></>;
      }
      router.replace(`/onboarding`);
      return <></>;
    }
    return <>{children}</>;
  }

  if (pageType === EPageTypes.AUTHENTICATED) {
    if (currentUser?.id) {
      if (currentUserProfile && currentUserProfile?.id && isUserOnboard) {
        // Forced-2FA: block the app shell until a factor is confirmed.
        if (mfaSetupRequired && pathname !== MFA_SETUP_ROUTE) {
          router.push(MFA_SETUP_ROUTE);
          return <></>;
        }
        return <>{children}</>;
      } else {
        router.push(`/onboarding`);
        return <></>;
      }
    } else {
      router.push(`/${pathname ? `?next_path=${pathname}` : ``}`);
      return <></>;
    }
  }

  return <>{children}</>;
});
