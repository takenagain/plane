from rest_framework import serializers

from django.utils import timezone

from plane.db.models import Worklog

from .base import BaseSerializer


class WorklogSerializer(BaseSerializer):
    class Meta:
        model = Worklog
        fields = [
            "id",
            "issue",
            "actor",
            "description",
            "duration",
            "logged_at",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "issue",
            "actor",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def validate_logged_at(self, value):
        """Ensure logged_at is not in the future."""
        if value > timezone.localdate():
            raise serializers.ValidationError("logged_at cannot be in the future.")
        return value

    def validate_duration(self, value):
        """Ensure duration bounds while preserving active-tracker sentinel updates."""
        if value < 0:
            raise serializers.ValidationError("Duration cannot be negative.")
        # Keep manual create/update duration >= 1, but allow existing active timers (duration=0)
        # to be updated without forcing a duration bump in partial updates.
        if value == 0:
            if self.instance is None or self.instance.duration != 0:
                raise serializers.ValidationError("Duration must be at least 1 minute.")
            return value
        if value < 1:
            raise serializers.ValidationError("Duration must be at least 1 minute.")
        if value > 99999:
            raise serializers.ValidationError("Duration cannot exceed 99,999 minutes.")
        return value

    def validate_description(self, value):
        """Enforce description length limit."""
        if len(value) > 10000:
            raise serializers.ValidationError("Description cannot exceed 10,000 characters.")
        return value


class ActiveWorklogSerializer(WorklogSerializer):
    issue_name = serializers.CharField(source="issue.name", read_only=True)
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)

    class Meta(WorklogSerializer.Meta):
        fields = [*WorklogSerializer.Meta.fields, "issue_name", "workspace_slug"]
        read_only_fields = [*WorklogSerializer.Meta.read_only_fields, "issue_name", "workspace_slug"]


class WorklogTotalSerializer(serializers.Serializer):
    """Read-only serializer for the total duration aggregation response."""

    total_duration = serializers.IntegerField(read_only=True)
