import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WorkspaceAIAgentSettings } from "@/components/settings/workspace/content/ai-agent-settings";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";
import { AIAgentWorkspaceSettingsHeader } from "./header";

function WorkspaceAIAgentSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const canAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (workspaceUserInfo && !canAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<AIAgentWorkspaceSettingsHeader />}>
      <PageHead title="Workspace AI Agent Settings" />
      <WorkspaceAIAgentSettings workspaceSlug={workspaceSlug} />
    </SettingsContentWrapper>
  );
}

export default observer(WorkspaceAIAgentSettingsPage);
