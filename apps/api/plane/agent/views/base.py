from django.core.exceptions import PermissionDenied

from plane.app.views.base import BaseAPIView
from plane.db.models import AgentConfiguration, WorkspaceMember


class AgentBaseView(BaseAPIView):
    def check_workspace_member(self, workspace_slug: str, user) -> None:
        is_member = WorkspaceMember.objects.filter(
            workspace__slug=workspace_slug,
            member=user,
            is_active=True,
        ).exists()
        if not is_member:
            raise PermissionDenied("You do not have access to this workspace.")

    def get_agent_config(self, workspace_slug: str, project_id=None):
        workspace_qs = AgentConfiguration.objects.filter(
            workspace__slug=workspace_slug,
            project__isnull=True,
        )
        if project_id:
            project_cfg = AgentConfiguration.objects.filter(
                workspace__slug=workspace_slug,
                project_id=project_id,
            ).first()
            if project_cfg:
                return project_cfg
        return workspace_qs.first()

    def check_agent_enabled(self, config: AgentConfiguration | None) -> None:
        if not config or not config.is_enabled:
            raise PermissionDenied("Agent is disabled for this scope.")
