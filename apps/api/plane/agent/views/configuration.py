from rest_framework import status
from rest_framework.response import Response

from plane.db.models import AgentConfiguration, Project, ProjectMember, Workspace, WorkspaceMember
from plane.db.models.project import ROLE

from .base import AgentBaseView
from ..serializers import AgentConfigSerializer


class WorkspaceAgentConfigView(AgentBaseView):
    def get(self, request, slug):
        self.check_workspace_member(slug, request.user)
        config = AgentConfiguration.objects.filter(workspace__slug=slug, project__isnull=True).first()
        if not config:
            return Response({"error": "Configuration not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AgentConfigSerializer(config).data, status=status.HTTP_200_OK)

    def post(self, request, slug):
        self.check_workspace_member(slug, request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()
        if not is_admin:
            return Response({"error": "Only workspace admins can update configuration."}, status=status.HTTP_403_FORBIDDEN)

        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        config = AgentConfiguration.objects.filter(workspace_id=workspace.id, project__isnull=True).first()
        serializer = AgentConfigSerializer(instance=config, data=request.data, partial=bool(config))
        serializer.is_valid(raise_exception=True)
        saved = serializer.save(workspace_id=workspace.id, project=None)
        return Response(AgentConfigSerializer(saved).data, status=status.HTTP_200_OK)


class ProjectAgentConfigView(AgentBaseView):
    def get(self, request, slug, project_id):
        self.check_workspace_member(slug, request.user)
        config = AgentConfiguration.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if not config:
            return Response({"error": "Configuration not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AgentConfigSerializer(config).data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id):
        self.check_workspace_member(slug, request.user)
        project = Project.objects.filter(id=project_id, workspace__slug=slug).first()
        if not project:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        is_admin = ProjectMember.objects.filter(
            project_id=project_id,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()
        if not is_admin:
            return Response({"error": "Only project admins can update configuration."}, status=status.HTTP_403_FORBIDDEN)

        config = AgentConfiguration.objects.filter(workspace_id=project.workspace_id, project_id=project_id).first()
        serializer = AgentConfigSerializer(instance=config, data=request.data, partial=bool(config))
        serializer.is_valid(raise_exception=True)
        saved = serializer.save(workspace_id=project.workspace_id, project_id=project_id)
        return Response(AgentConfigSerializer(saved).data, status=status.HTTP_200_OK)
