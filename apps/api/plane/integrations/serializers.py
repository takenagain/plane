from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.db.models import (
    GithubRepository,
    GithubRepositorySync,
    Integration,
    WorkspaceIntegration,
)


class IntegrationSerializer(BaseSerializer):
    class Meta:
        model = Integration
        fields = [
            "id",
            "title",
            "provider",
            "network",
            "description",
            "author",
            "webhook_url",
            "webhook_secret",
            "redirect_url",
            "metadata",
            "verified",
            "avatar_url",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


class WorkspaceIntegrationSerializer(BaseSerializer):
    integration_detail = IntegrationSerializer(source="integration", read_only=True)

    class Meta:
        model = WorkspaceIntegration
        fields = [
            "id",
            "workspace",
            "actor",
            "integration",
            "integration_detail",
            "api_token",
            "metadata",
            "config",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


class GithubRepositorySerializer(BaseSerializer):
    class Meta:
        model = GithubRepository
        fields = [
            "id",
            "name",
            "url",
            "owner",
            "repository_id",
            "config",
            "project",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class GithubRepositorySyncSerializer(BaseSerializer):
    repo_detail = GithubRepositorySerializer(source="repository", read_only=True)

    class Meta:
        model = GithubRepositorySync
        fields = [
            "id",
            "repository",
            "repo_detail",
            "project",
            "workspace",
            "actor",
            "workspace_integration",
            "label",
            "credentials",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
