/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { SentryIntegrationService } from "@/services/integrations";

const sentryIntegrationService = new SentryIntegrationService();

const useIntegrationPopup = ({
  provider,
  stateParams,
  github_app_name,
  slack_client_id,
  workspaceSlug: workspaceSlugProp,
}: {
  provider: string | undefined;
  stateParams?: string;
  github_app_name?: string;
  slack_client_id?: string;
  workspaceSlug?: string;
}) => {
  const [authLoader, setAuthLoader] = useState(false);

  const { workspaceSlug: routeWorkspaceSlug, projectId } = useParams();
  const workspaceSlug = workspaceSlugProp || routeWorkspaceSlug?.toString();

  const providerUrls: { [key: string]: string } = {
    github: `https://github.com/apps/${github_app_name}/installations/new?state=${workspaceSlug?.toString()}`,
    slack: `https://slack.com/oauth/v2/authorize?scope=chat:write,im:history,im:write,links:read,links:write,users:read,users:read.email&amp;user_scope=&amp;&client_id=${slack_client_id}&state=${workspaceSlug?.toString()}`,
    slackChannel: `https://slack.com/oauth/v2/authorize?scope=incoming-webhook&client_id=${slack_client_id}&state=${workspaceSlug?.toString()},${projectId?.toString()}${
      stateParams ? "," + stateParams : ""
    }`,
  };

  const popup = useRef<any>();

  const checkPopup = () => {
    const check = setInterval(() => {
      if (!popup || popup.current.closed || popup.current.closed === undefined) {
        clearInterval(check);
        setAuthLoader(false);
      }
    }, 1000);
  };

  const openPopup = () => {
    if (!provider) return;

    const width = 600,
      height = 600;
    const left = window.innerWidth / 2 - width / 2;
    const top = window.innerHeight / 2 - height / 2;
    const url = providerUrls[provider];

    return window.open(url, "", `width=${width}, height=${height}, top=${top}, left=${left}`);
  };

  const startAuth = async () => {
    if (provider === "sentry" && workspaceSlug) {
      setAuthLoader(true);
      try {
        const { auth_url } = await sentryIntegrationService.getInstallUrl(workspaceSlug);
        const width = 600;
        const height = 600;
        const left = window.innerWidth / 2 - width / 2;
        const top = window.innerHeight / 2 - height / 2;
        popup.current = window.open(auth_url, "", `width=${width}, height=${height}, top=${top}, left=${left}`);
        checkPopup();
      } catch {
        setAuthLoader(false);
      }
      return;
    }

    popup.current = openPopup();
    checkPopup();
    setAuthLoader(true);
  };

  return {
    startAuth,
    isConnecting: authLoader,
  };
};

export default useIntegrationPopup;
