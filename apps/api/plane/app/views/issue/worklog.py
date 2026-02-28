# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

from django.core.serializers.json import DjangoJSONEncoder

# Django imports
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action

# Third Party imports
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorklogSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, IssueActivity, State, Worklog
from plane.utils.host import base_host

# Module imports
from .. import BaseViewSet


def _elapsed_minutes_from_created_at(created_at, now=None) -> int:
    if created_at is None:
        return 0
    current_time = now or timezone.now()
    elapsed_seconds = (current_time - created_at).total_seconds()
    return max(0, int(elapsed_seconds // 60))


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

    def _get_active_worklog_for_actor(self):
        return self.get_queryset().filter(actor=self.request.user, duration=0).order_by("-created_at").first()

    def _get_total_duration_with_active_tracking(self) -> int:
        queryset = self.get_queryset().select_related(None).only("duration", "created_at")
        now = timezone.now()
        total_duration = 0

        for worklog in queryset:
            if worklog.duration == 0:
                total_duration += _elapsed_minutes_from_created_at(worklog.created_at, now)
            else:
                total_duration += worklog.duration

        return total_duration

    def _maybe_auto_transition_issue_state_on_tracking_start(self, issue_id, project_id):
        issue = (
            Issue.issue_objects.select_related("state")
            .filter(
                pk=issue_id,
                project_id=project_id,
                workspace__slug=self.kwargs.get("slug"),
            )
            .first()
        )
        if issue is None or issue.state is None:
            return

        normalized_state_name = "".join(ch for ch in issue.state.name.lower() if ch.isalnum())
        if normalized_state_name not in {"backlog", "todo"}:
            return

        # Skip auto-transition if state was explicitly changed after issue creation.
        if IssueActivity.objects.filter(issue_id=issue.id, field="state").exists():
            return

        target_state = (
            State.objects.filter(project_id=project_id, name__iexact="In Progress").order_by("sequence").first()
        )
        if target_state is None:
            target_state = State.objects.filter(project_id=project_id, group="started").order_by("sequence").first()

        if target_state is None or target_state.id == issue.state_id:
            return

        previous_state = issue.state
        issue.state = target_state
        issue.updated_by = self.request.user
        issue.save(update_fields=["state", "updated_by", "updated_at"])

        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"state": str(target_state.id)}, cls=DjangoJSONEncoder),
            actor_id=str(self.request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=json.dumps({"state_id": str(previous_state.id)}, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=False,
            origin=base_host(request=self.request, is_app=True),
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        issue_exists = Issue.objects.filter(
            pk=issue_id,
            project_id=project_id,
            workspace__slug=slug,
        ).exists()
        if not issue_exists:
            return Response(
                {"error": "Issue does not belong to the specified project/workspace."},
                status=status.HTTP_404_NOT_FOUND,
            )

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

    @action(detail=False, methods=["post"], url_path="start")
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def start(self, request, slug, project_id, issue_id):
        active_worklog = self._get_active_worklog_for_actor()
        if active_worklog is not None:
            return Response(
                {"error": "An active time tracker already exists for this work item."},
                status=status.HTTP_409_CONFLICT,
            )

        worklog = Worklog.objects.create(
            project_id=project_id,
            issue_id=issue_id,
            actor=request.user,
            description="",
            duration=0,
            logged_at=timezone.localdate(),
            created_by=request.user,
            updated_by=request.user,
        )

        self._maybe_auto_transition_issue_state_on_tracking_start(issue_id=issue_id, project_id=project_id)

        serialized_worklog = WorklogSerializer(worklog).data
        issue_activity.delay(
            type="worklog.activity.created",
            requested_data=json.dumps(serialized_worklog, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=False,
            origin=base_host(request=request, is_app=True),
        )

        return Response(serialized_worklog, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="stop")
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def stop(self, request, slug, project_id, issue_id):
        active_worklog = self._get_active_worklog_for_actor()
        if active_worklog is None:
            return Response(
                {"error": "No active time tracker found for this work item."},
                status=status.HTTP_404_NOT_FOUND,
            )

        elapsed_minutes = _elapsed_minutes_from_created_at(active_worklog.created_at)
        active_worklog.duration = max(1, elapsed_minutes)
        active_worklog.updated_by = request.user
        active_worklog.save(update_fields=["duration", "updated_by", "updated_at"])

        serializer = WorklogSerializer(active_worklog)
        return Response(serializer.data, status=status.HTTP_200_OK)

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
        total = self._get_total_duration_with_active_tracking()
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
