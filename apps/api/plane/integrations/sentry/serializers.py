from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.db.models import SentryProjectMapping, SentryWorkspaceConnection


class SentryConnectionSerializer(BaseSerializer):
    class Meta:
        model = SentryWorkspaceConnection
        fields = [
            "id",
            "sentry_org_slug",
            "metadata",
            "created_at",
            "updated_at",
        ]


class SentryProjectMappingSerializer(BaseSerializer):
    class Meta:
        model = SentryProjectMapping
        fields = [
            "id",
            "sentry_project_slug",
            "project",
            "unresolved_state",
            "resolved_state",
            "created_at",
            "updated_at",
        ]


class SentryIssueLinkSerializer(serializers.Serializer):
    workspace_slug = serializers.CharField()
    project_id = serializers.UUIDField()
    issue_id = serializers.UUIDField()
    sentry_project_slug = serializers.CharField(required=False)
    sentry_issue = serializers.DictField(required=False)
