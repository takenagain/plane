# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views import BaseAPIView
from plane.db.models import (
    APIToken,
    GithubRepository,
    GithubRepositorySync,
    Integration,
    Project,
    ProjectMember,
    User,
    Workspace,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.integrations.config import is_github_sync_enabled
from plane.integrations.sentry.config import is_sentry_sync_enabled
from plane.integrations.ensure import ensure_integration_catalog
from plane.integrations.github.client import get_installation_access_token, list_installation_repositories
from plane.integrations.serializers import (
    GithubRepositorySyncSerializer,
    IntegrationSerializer,
    WorkspaceIntegrationSerializer,
)
def _github_disabled_response():
    return Response({"error": "GitHub sync is not enabled on this instance"}, status=status.HTTP_403_FORBIDDEN)


def _create_github_bot_user(workspace: Workspace, created_by: User) -> User:
    unique = uuid.uuid4().hex[:8]
    bot = User.objects.create(
        email=f"github-bot-{unique}@plane.local",
        username=f"github_bot_{unique}",
        display_name="GitHub",
        first_name="GitHub",
        last_name="Bot",
        is_bot=True,
        bot_type="GITHUB",
    )
    bot.set_password(uuid.uuid4().hex)
    bot.save()

    WorkspaceMember.objects.get_or_create(
        workspace=workspace,
        member=bot,
        defaults={
            "role": 5,
            "is_active": True,
            "created_by": created_by,
            "updated_by": created_by,
        },
    )
    return bot


class IntegrationListEndpoint(BaseAPIView):
    def get(self, request):
        ensure_integration_catalog()
        providers = []
        if is_github_sync_enabled():
            providers.extend(["github", "slack"])
        if is_sentry_sync_enabled():
            providers.append("sentry")
        if not providers:
            return Response([], status=status.HTTP_200_OK)

        integrations = Integration.objects.filter(provider__in=providers).order_by("title")
        serializer = IntegrationSerializer(integrations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceIntegrationListEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        if not is_github_sync_enabled():
            return Response([], status=status.HTTP_200_OK)

        workspace = Workspace.objects.get(slug=slug)
        integrations = WorkspaceIntegration.objects.filter(workspace=workspace).select_related("integration")
        serializer = WorkspaceIntegrationSerializer(integrations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceIntegrationInstallEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def post(self, request, slug, provider):
        if not is_github_sync_enabled():
            return _github_disabled_response()

        if provider != "github":
            return Response({"error": "Unsupported provider"}, status=status.HTTP_400_BAD_REQUEST)

        installation_id = request.data.get("installation_id")
        if not installation_id:
            return Response({"error": "installation_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        ensure_integration_catalog()
        integration = Integration.objects.get(provider="github")
        workspace = Workspace.objects.get(slug=slug)

        existing = WorkspaceIntegration.objects.filter(workspace=workspace, integration=integration).first()
        if existing:
            metadata = existing.metadata or {}
            metadata["installation_id"] = int(installation_id)
            token = get_installation_access_token(int(installation_id))
            if token:
                metadata["installation_token"] = token
            existing.metadata = metadata
            existing.save(update_fields=["metadata", "updated_at"])
            serializer = WorkspaceIntegrationSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        bot_user = _create_github_bot_user(workspace, request.user)
        api_token = APIToken.objects.create(
            label=f"github-{workspace.slug}",
            description="GitHub integration service token",
            user=bot_user,
            user_type=1,
        )

        metadata = {"installation_id": int(installation_id)}
        token = get_installation_access_token(int(installation_id))
        if token:
            metadata["installation_token"] = token

        workspace_integration = WorkspaceIntegration.objects.create(
            workspace=workspace,
            integration=integration,
            actor=bot_user,
            api_token=api_token,
            metadata=metadata,
            config={},
            created_by=request.user,
            updated_by=request.user,
        )
        serializer = WorkspaceIntegrationSerializer(workspace_integration)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceIntegrationDeleteEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, workspace_integration_id):
        if not is_github_sync_enabled():
            return _github_disabled_response()

        workspace = Workspace.objects.get(slug=slug)
        workspace_integration = WorkspaceIntegration.objects.get(
            pk=workspace_integration_id, workspace=workspace
        )
        workspace_integration.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubRepositoriesEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, workspace_integration_id):
        if not is_github_sync_enabled():
            return _github_disabled_response()

        workspace = Workspace.objects.get(slug=slug)
        workspace_integration = WorkspaceIntegration.objects.get(
            pk=workspace_integration_id, workspace=workspace
        )
        installation_id = (workspace_integration.metadata or {}).get("installation_id")
        if not installation_id:
            return Response(
                {"error": "GitHub installation is not configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page = max(int(request.GET.get("page", 1)), 1)
        per_page = min(max(int(request.GET.get("per_page", 30)), 1), 100)
        repositories, total_count = list_installation_repositories(int(installation_id), page=page, per_page=per_page)

        formatted = [
            {
                "id": str(repo.get("id")),
                "full_name": repo.get("full_name"),
                "html_url": repo.get("html_url"),
                "url": repo.get("url"),
                "owner": repo.get("owner", {}),
                "name": repo.get("name"),
            }
            for repo in repositories
        ]
        return Response({"repositories": formatted, "total_count": total_count}, status=status.HTTP_200_OK)


class GithubRepositorySyncEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, workspace_integration_id):
        if not is_github_sync_enabled():
            return Response([], status=status.HTTP_200_OK)

        syncs = GithubRepositorySync.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            workspace_integration_id=workspace_integration_id,
            deleted_at__isnull=True,
        ).select_related("repository")
        serializer = GithubRepositorySyncSerializer(syncs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def post(self, request, slug, project_id, workspace_integration_id):
        if not is_github_sync_enabled():
            return _github_disabled_response()

        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        workspace_integration = WorkspaceIntegration.objects.get(
            pk=workspace_integration_id, workspace=project.workspace
        )

        name = request.data.get("name")
        owner = request.data.get("owner")
        repository_id = request.data.get("repository_id")
        url = request.data.get("url")

        if not all([name, owner, repository_id]):
            return Response({"error": "name, owner, and repository_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        repository, _ = GithubRepository.objects.update_or_create(
            project=project,
            repository_id=int(repository_id),
            defaults={
                "workspace": project.workspace,
                "name": name,
                "owner": owner,
                "url": url,
                "config": request.data.get("config", {}),
                "created_by": request.user,
                "updated_by": request.user,
            },
        )

        repository_sync, _ = GithubRepositorySync.objects.update_or_create(
            project=project,
            repository=repository,
            defaults={
                "workspace": project.workspace,
                "workspace_integration": workspace_integration,
                "actor": workspace_integration.actor,
                "credentials": {},
                "created_by": request.user,
                "updated_by": request.user,
            },
        )

        if not ProjectMember.objects.filter(project=project, member=workspace_integration.actor, is_active=True).exists():
            ProjectMember.objects.create(
                project=project,
                member=workspace_integration.actor,
                role=5,
                is_active=True,
                created_by=request.user,
                updated_by=request.user,
            )

        serializer = GithubRepositorySyncSerializer(repository_sync)
        return Response(serializer.data, status=status.HTTP_200_OK)
