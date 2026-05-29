import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { CheckCircle, Plus, Trash2 } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Loader } from "@plane/ui";
import SentryLogo from "@/app/assets/services/sentry.svg?url";
import { useInstance } from "@/hooks/store/use-instance";
import { useUserPermissions } from "@/hooks/store/user";
import useIntegrationPopup from "@/hooks/use-integration-popup";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { SentryIntegrationService } from "@/services/integrations";

const sentryService = new SentryIntegrationService();

export const SentryIntegrationCard = observer(function SentryIntegrationCard() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { config } = useInstance();
  const { allowPermissions } = useUserPermissions();
  const { isMobile } = usePlatformOS();
  const [disconnecting, setDisconnecting] = useState(false);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [sentryProjectSlug, setSentryProjectSlug] = useState("");
  const [planeProjectId, setPlaneProjectId] = useState("");
  const [unresolvedStateId, setUnresolvedStateId] = useState("");
  const [resolvedStateId, setResolvedStateId] = useState("");

  const isUserAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const { startAuth, isConnecting } = useIntegrationPopup({
    provider: "sentry",
    workspaceSlug: workspaceSlug?.toString(),
  });

  const { data: connection, mutate: mutateConnection } = useSWR(
    workspaceSlug && config?.is_sentry_enabled ? `SENTRY_CONNECTION_${workspaceSlug}` : null,
    () => (workspaceSlug ? sentryService.getConnection(workspaceSlug.toString()) : null)
  );

  const { data: mappings, mutate: mutateMappings } = useSWR(
    workspaceSlug && connection?.connected ? `SENTRY_MAPPINGS_${workspaceSlug}` : null,
    () => (workspaceSlug ? sentryService.getMappings(workspaceSlug.toString()) : null)
  );

  if (!config?.is_sentry_enabled) return null;

  const handleDisconnect = async () => {
    if (!workspaceSlug) return;
    setDisconnecting(true);
    try {
      await sentryService.disconnect(workspaceSlug.toString());
      await mutateConnection({ connected: false }, false);
      await mutateMappings([], false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("sentry_integration.disconnect_workspace", { name: connection?.sentry_org_slug || "Sentry" }),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error"),
        message: t("common.something_went_wrong"),
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCreateMapping = async () => {
    if (!workspaceSlug || !planeProjectId || !sentryProjectSlug || !unresolvedStateId || !resolvedStateId) return;
    try {
      await sentryService.createMapping(workspaceSlug.toString(), {
        project: planeProjectId,
        sentry_project_slug: sentryProjectSlug,
        unresolved_state: unresolvedStateId,
        resolved_state: resolvedStateId,
      });
      await mutateMappings();
      setShowMappingForm(false);
      setSentryProjectSlug("");
      setPlaneProjectId("");
      setUnresolvedStateId("");
      setResolvedStateId("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("sentry_integration.state_mapping.add_new_state_mapping"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error"),
        message: t("sentry_integration.state_mapping.failed_loading_state_mappings"),
      });
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!workspaceSlug) return;
    try {
      await sentryService.deleteMapping(workspaceSlug.toString(), mappingId);
      await mutateMappings();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error"),
        message: t("common.something_went_wrong"),
      });
    }
  };

  const isConnected = connection?.connected;

  return (
    <div className="border-b border-subtle bg-surface-1 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 flex-shrink-0">
            <img src={SentryLogo} className="h-full w-full object-contain" alt="Sentry" />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-body-xs-medium">
              {t("sentry_integration.name")}
              {isConnected && <CheckCircle className="h-3.5 w-3.5 fill-transparent text-success-primary" />}
            </h3>
            <p className="text-body-xs-regular text-secondary">{t("sentry_integration.description")}</p>
            {isConnected && connection?.sentry_org_slug && (
              <p className="mt-1 text-body-xs-regular text-tertiary">
                {t("sentry_integration.connected_sentry_workspaces")}: {connection.sentry_org_slug}
              </p>
            )}
          </div>
        </div>

        {connection === undefined ? (
          <Loader>
            <Loader.Item height="32px" width="64px" />
          </Loader>
        ) : isConnected ? (
          <Tooltip
            isMobile={isMobile}
            disabled={isUserAdmin}
            tooltipContent={!isUserAdmin ? "You don't have permission to perform this" : null}
          >
            <Button
              variant="error-fill"
              disabled={!isUserAdmin}
              loading={disconnecting}
              onClick={() => isUserAdmin && handleDisconnect()}
            >
              {disconnecting ? t("oauth_bridge_integration.uninstalling") : t("oauth_bridge_integration.uninstall")}
            </Button>
          </Tooltip>
        ) : (
          <Tooltip
            isMobile={isMobile}
            disabled={isUserAdmin}
            tooltipContent={!isUserAdmin ? "You don't have permission to perform this" : null}
          >
            <Button
              variant="primary"
              disabled={!isUserAdmin}
              loading={isConnecting}
              onClick={() => isUserAdmin && startAuth()}
            >
              {isConnecting ? t("oauth_bridge_integration.uninstalling") : t("oauth_bridge_integration.connect")}
            </Button>
          </Tooltip>
        )}
      </div>

      {isConnected && (
        <div className="mt-6 space-y-4 border-t border-subtle pt-4">
          <div>
            <h4 className="text-body-xs-medium">{t("sentry_integration.state_mapping.title")}</h4>
            <p className="text-body-xs-regular text-secondary">{t("sentry_integration.state_mapping.description")}</p>
          </div>

          {connection?.webhook_url && (
            <p className="text-body-xs-regular break-all text-tertiary">Webhook URL: {connection.webhook_url}</p>
          )}

          {mappings && mappings.length > 0 ? (
            <ul className="space-y-2">
              {mappings.map((mapping) => (
                <li
                  key={mapping.id}
                  className="flex items-center justify-between rounded-md border border-subtle px-3 py-2 text-body-xs-regular"
                >
                  <span>
                    {mapping.sentry_project_slug} → {mapping.project}
                  </span>
                  <button
                    type="button"
                    className="text-danger"
                    onClick={() => handleDeleteMapping(mapping.id)}
                    aria-label="Delete mapping"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-xs-regular text-tertiary">{t("sentry_integration.state_mapping.empty_state")}</p>
          )}

          {showMappingForm ? (
            <div className="grid gap-2 rounded-md border border-subtle p-3">
              <input
                className="rounded border border-subtle bg-surface-2 px-2 py-1 text-body-xs-regular"
                placeholder="Sentry project slug"
                value={sentryProjectSlug}
                onChange={(e) => setSentryProjectSlug(e.target.value)}
              />
              <input
                className="rounded border border-subtle bg-surface-2 px-2 py-1 text-body-xs-regular"
                placeholder="Plane project ID"
                value={planeProjectId}
                onChange={(e) => setPlaneProjectId(e.target.value)}
              />
              <input
                className="rounded border border-subtle bg-surface-2 px-2 py-1 text-body-xs-regular"
                placeholder="Unresolved state ID"
                value={unresolvedStateId}
                onChange={(e) => setUnresolvedStateId(e.target.value)}
              />
              <input
                className="rounded border border-subtle bg-surface-2 px-2 py-1 text-body-xs-regular"
                placeholder="Resolved state ID"
                value={resolvedStateId}
                onChange={(e) => setResolvedStateId(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleCreateMapping}>
                  {t("common.save")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowMappingForm(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShowMappingForm(true)}>
              <Plus className="mr-1 h-3 w-3" />
              {t("sentry_integration.state_mapping.add_new_state_mapping")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
