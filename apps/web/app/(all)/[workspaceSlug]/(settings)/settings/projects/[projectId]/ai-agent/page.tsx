import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { ProjectAIAgentSettings } from "@/components/settings/project/content/ai-agent-settings";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";
import { AIAgentProjectSettingsHeader } from "./header";

function ProjectAIAgentSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const canAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);

  if (workspaceUserInfo && !canAdmin) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<AIAgentProjectSettingsHeader />}>
      <PageHead title="Project AI Agent Settings" />
      <ProjectAIAgentSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </SettingsContentWrapper>
  );
}

export default observer(ProjectAIAgentSettingsPage);
