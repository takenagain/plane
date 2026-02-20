# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Sum

# Django imports
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action

# Third Party imports
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorklogSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Worklog
from plane.utils.host import base_host

# Module imports
from .. import BaseViewSet


class WorklogViewSet(BaseViewSet):
    serializer_class = WorklogSerializer
    model = Worklog

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("actor", "project", "workspace", "issue")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        serializer = WorklogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                issue_id=issue_id,
                actor=request.user,
            )
            issue_activity.delay(
                type="worklog.activity.created",
                requested_data=json.dumps(serializer.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=False,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_id):
        queryset = self.get_queryset()
        filters = {}
        if request.GET.get("created_at__gt"):
            filters["created_at__gt"] = request.GET.get("created_at__gt")
        queryset = queryset.filter(**filters)
        serializer = WorklogSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="total")
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def total(self, request, slug, project_id, issue_id):
        total = self.get_queryset().aggregate(total_duration=Sum("duration"))["total_duration"] or 0
        return Response({"total_duration": total}, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=Worklog)
    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = Worklog.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            pk=pk,
        )
        current_instance = json.dumps(WorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        serializer = WorklogSerializer(worklog, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            issue_activity.delay(
                type="worklog.activity.updated",
                requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=current_instance,
                epoch=int(timezone.now().timestamp()),
                notification=False,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=Worklog)
    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = Worklog.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            pk=pk,
        )
        current_instance = json.dumps(WorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        worklog.delete()
        issue_activity.delay(
            type="worklog.activity.deleted",
            requested_data=json.dumps({"worklog_id": str(pk)}, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current_instance,
            epoch=int(timezone.now().timestamp()),
            notification=False,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
