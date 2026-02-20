# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

from rest_framework import serializers

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
        if value > date.today():
            raise serializers.ValidationError("logged_at cannot be in the future.")
        return value

    def validate_duration(self, value):
        """Ensure duration is positive and within bounds."""
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


class WorklogTotalSerializer(serializers.Serializer):
    """Read-only serializer for the total duration aggregation response."""

    total_duration = serializers.IntegerField(read_only=True)
