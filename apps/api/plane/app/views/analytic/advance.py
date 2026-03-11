# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import csv
from io import StringIO
from typing import Any, Dict, List

from rest_framework.response import Response
from rest_framework import status
from django.db.models import Case, Count, F, IntegerField, Q, QuerySet, Sum, Value, When
from django.http import HttpRequest, HttpResponse
from django.db.models.functions import Cast, Coalesce, Extract, Greatest, Now, TruncMonth
from django.utils import timezone

from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    WorkspaceMember,
    Project,
    Issue,
    Cycle,
    Module,
    IssueView,
    ProjectPage,
    Workspace,
    ProjectMember,
)
from plane.utils.build_chart import build_analytics_chart, build_time_logged_chart
from plane.utils.date_utils import (
    get_analytics_filters,
)


class AdvanceAnalyticsBaseView(BaseAPIView):
    def initialize_workspace(self, slug: str, type: str) -> None:
        self._workspace_slug = slug
        self.filters = get_analytics_filters(
            slug=slug,
            type=type,
            user=self.request.user,
            date_filter=self.request.GET.get("date_filter", None),
            project_ids=self.request.GET.get("project_ids", None),
        )


class AdvanceAnalyticsEndpoint(AdvanceAnalyticsBaseView):
    def get_filtered_counts(self, queryset: QuerySet) -> Dict[str, int]:
        def get_filtered_count() -> int:
            if self.filters["analytics_date_range"]:
                return queryset.filter(
                    created_at__gte=self.filters["analytics_date_range"]["current"]["gte"],
                    created_at__lte=self.filters["analytics_date_range"]["current"]["lte"],
                ).count()
            return queryset.count()

        def get_previous_count() -> int:
            if self.filters["analytics_date_range"] and self.filters["analytics_date_range"].get("previous"):
                return queryset.filter(
                    created_at__gte=self.filters["analytics_date_range"]["previous"]["gte"],
                    created_at__lte=self.filters["analytics_date_range"]["previous"]["lte"],
                ).count()
            return 0

        return {
            "count": get_filtered_count(),
            # "filter_count": get_previous_count(),
        }

    def get_overview_data(self) -> Dict[str, Dict[str, int]]:
        members_query = WorkspaceMember.objects.filter(
            workspace__slug=self._workspace_slug, is_active=True, member__is_bot=False
        )

        if self.request.GET.get("project_ids", None):
            project_ids = self.request.GET.get("project_ids", None)
            project_ids = [str(project_id) for project_id in project_ids.split(",")]
            members_query = ProjectMember.objects.filter(
                project_id__in=project_ids, is_active=True, member__is_bot=False
            )

        return {
            "total_users": self.get_filtered_counts(members_query),
            "total_admins": self.get_filtered_counts(members_query.filter(role=ROLE.ADMIN.value)),
            "total_members": self.get_filtered_counts(members_query.filter(role=ROLE.MEMBER.value)),
            "total_guests": self.get_filtered_counts(members_query.filter(role=ROLE.GUEST.value)),
            "total_projects": self.get_filtered_counts(Project.objects.filter(**self.filters["project_filters"])),
            "total_work_items": self.get_filtered_counts(Issue.issue_objects.filter(**self.filters["base_filters"])),
            "total_cycles": self.get_filtered_counts(Cycle.objects.filter(**self.filters["base_filters"])),
            "total_intake": self.get_filtered_counts(
                Issue.objects.filter(**self.filters["base_filters"]).filter(
                    issue_intake__status__in=["-2", "-1", "0", "1", "2"]  # TODO: Add description for reference.
                )
            ),
        }

    def get_work_items_stats(self) -> Dict[str, Dict[str, int]]:
        base_queryset = Issue.issue_objects.filter(**self.filters["base_filters"])

        return {
            "total_work_items": self.get_filtered_counts(base_queryset),
            "started_work_items": self.get_filtered_counts(base_queryset.filter(state__group="started")),
            "backlog_work_items": self.get_filtered_counts(base_queryset.filter(state__group="backlog")),
            "un_started_work_items": self.get_filtered_counts(base_queryset.filter(state__group="unstarted")),
            "completed_work_items": self.get_filtered_counts(base_queryset.filter(state__group="completed")),
        }

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request: HttpRequest, slug: str) -> Response:
        self.initialize_workspace(slug, type="analytics")
        tab = request.GET.get("tab", "overview")

        if tab == "overview":
            return Response(
                self.get_overview_data(),
                status=status.HTTP_200_OK,
            )
        elif tab == "work-items":
            return Response(
                self.get_work_items_stats(),
                status=status.HTTP_200_OK,
            )
        return Response({"message": "Invalid tab"}, status=status.HTTP_400_BAD_REQUEST)


class AdvanceAnalyticsStatsEndpoint(AdvanceAnalyticsBaseView):
    def get_project_issues_stats(self) -> QuerySet:
        # Get the base queryset with workspace and project filters
        base_queryset = Issue.issue_objects.filter(**self.filters["base_filters"])

        # Apply date range filter if available
        if self.filters["chart_period_range"]:
            start_date, end_date = self.filters["chart_period_range"]
            base_queryset = base_queryset.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

        return (
            base_queryset.values("project_id", "project__name")
            .annotate(
                cancelled_work_items=Count("id", filter=Q(state__group="cancelled")),
                completed_work_items=Count("id", filter=Q(state__group="completed")),
                backlog_work_items=Count("id", filter=Q(state__group="backlog")),
                un_started_work_items=Count("id", filter=Q(state__group="unstarted")),
                started_work_items=Count("id", filter=Q(state__group="started")),
            )
            .order_by("project_id")
        )

    def get_work_items_stats(self) -> Dict[str, Dict[str, int]]:
        base_queryset = Issue.issue_objects.filter(**self.filters["base_filters"])
        return (
            base_queryset.values("project_id", "project__name")
            .annotate(
                cancelled_work_items=Count("id", filter=Q(state__group="cancelled")),
                completed_work_items=Count("id", filter=Q(state__group="completed")),
                backlog_work_items=Count("id", filter=Q(state__group="backlog")),
                un_started_work_items=Count("id", filter=Q(state__group="unstarted")),
                started_work_items=Count("id", filter=Q(state__group="started")),
            )
            .order_by("project_id")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request: HttpRequest, slug: str) -> Response:
        self.initialize_workspace(slug, type="chart")
        type = request.GET.get("type", "work-items")

        if type == "work-items":
            return Response(
                self.get_work_items_stats(),
                status=status.HTTP_200_OK,
            )

        return Response({"message": "Invalid type"}, status=status.HTTP_400_BAD_REQUEST)


class AdvanceAnalyticsChartEndpoint(AdvanceAnalyticsBaseView):
    def project_chart(self) -> List[Dict[str, Any]]:
        # Get the base queryset with workspace and project filters
        base_queryset = Issue.issue_objects.filter(**self.filters["base_filters"])
        date_filter = {}

        # Apply date range filter if available
        if self.filters["chart_period_range"]:
            start_date, end_date = self.filters["chart_period_range"]
            date_filter = {
                "created_at__date__gte": start_date,
                "created_at__date__lte": end_date,
            }

        total_work_items = base_queryset.filter(**date_filter).count()
        total_cycles = Cycle.objects.filter(**self.filters["base_filters"], **date_filter).count()
        total_modules = Module.objects.filter(**self.filters["base_filters"], **date_filter).count()
        total_intake = Issue.objects.filter(
            issue_intake__isnull=False, **self.filters["base_filters"], **date_filter
        ).count()
        total_members = WorkspaceMember.objects.filter(
            workspace__slug=self._workspace_slug, is_active=True, **date_filter
        ).count()
        total_pages = ProjectPage.objects.filter(**self.filters["base_filters"], **date_filter).count()
        total_views = IssueView.objects.filter(**self.filters["base_filters"], **date_filter).count()

        data = {
            "work_items": total_work_items,
            "cycles": total_cycles,
            "modules": total_modules,
            "intake": total_intake,
            "members": total_members,
            "pages": total_pages,
            "views": total_views,
        }

        return [
            {
                "key": key,
                "name": key.replace("_", " ").title(),
                "count": value or 0,
            }
            for key, value in data.items()
        ]

    def work_item_completion_chart(self) -> Dict[str, Any]:
        # Get the base queryset
        queryset = (
            Issue.issue_objects.filter(**self.filters["base_filters"])
            .select_related("workspace", "state", "parent")
            .prefetch_related("assignees", "labels", "issue_module__module", "issue_cycle__cycle")
        )

        workspace = Workspace.objects.get(slug=self._workspace_slug)
        start_date = workspace.created_at.date().replace(day=1)

        # Apply date range filter if available
        if self.filters["chart_period_range"]:
            start_date, end_date = self.filters["chart_period_range"]
            queryset = queryset.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

        # Annotate by month and count
        monthly_stats = (
            queryset.annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(
                created_count=Count("id"),
                completed_count=Count("id", filter=Q(state__group="completed")),
            )
            .order_by("month")
        )

        # Create dictionary of month -> counts
        stats_dict = {
            stat["month"].strftime("%Y-%m-%d"): {
                "created_count": stat["created_count"],
                "completed_count": stat["completed_count"],
            }
            for stat in monthly_stats
        }

        # Generate monthly data (ensure months with 0 count are included)
        data = []
        # include the current date at the end
        end_date = timezone.now().date()
        last_month = end_date.replace(day=1)
        current_month = start_date

        while current_month <= last_month:
            date_str = current_month.strftime("%Y-%m-%d")
            stats = stats_dict.get(date_str, {"created_count": 0, "completed_count": 0})
            data.append(
                {
                    "key": date_str,
                    "name": date_str,
                    "count": stats["created_count"],
                    "completed_issues": stats["completed_count"],
                    "created_issues": stats["created_count"],
                }
            )
            # Move to next month
            if current_month.month == 12:
                current_month = current_month.replace(year=current_month.year + 1, month=1)
            else:
                current_month = current_month.replace(month=current_month.month + 1)

        schema = {
            "completed_issues": "completed_issues",
            "created_issues": "created_issues",
        }

        return {"data": data, "schema": schema}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request: HttpRequest, slug: str) -> Response:
        self.initialize_workspace(slug, type="chart")
        type = request.GET.get("type", "projects")
        group_by = request.GET.get("group_by", None)
        x_axis = request.GET.get("x_axis", "PRIORITY")
        y_axis = request.GET.get("y_axis", "WORK_ITEM_COUNT")

        if type == "projects":
            return Response(self.project_chart(), status=status.HTTP_200_OK)

        elif type == "custom-work-items":
            queryset = (
                Issue.issue_objects.filter(**self.filters["base_filters"])
                .select_related("workspace", "state", "parent")
                .prefetch_related("assignees", "labels", "issue_module__module", "issue_cycle__cycle")
            )

            # Apply date range filter if available
            date_range = None
            if self.filters["chart_period_range"]:
                start_date, end_date = self.filters["chart_period_range"]
                date_range = (start_date, end_date)
                # only apply to issues when y_axis is not hours logged
                if y_axis != "HOURS_LOGGED":
                    queryset = queryset.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

            if y_axis == "HOURS_LOGGED":
                return Response(
                    build_time_logged_chart(queryset, x_axis, group_by, date_range),
                    status=status.HTTP_200_OK,
                )
            else:
                return Response(
                    build_analytics_chart(queryset, x_axis, group_by),
                    status=status.HTTP_200_OK,
                )

        elif type == "work-items":
            return Response(
                self.work_item_completion_chart(),
                status=status.HTTP_200_OK,
            )

        return Response({"message": "Invalid type"}, status=status.HTTP_400_BAD_REQUEST)


class TimeLoggedExportEndpoint(AdvanceAnalyticsBaseView):
    """CSV export of hours logged per issue for workspace-level filters."""

    @staticmethod
    def _sanitize_csv_cell(value: str) -> str:
        if not value:
            return ""

        stripped_value = value.lstrip()
        if stripped_value and stripped_value[0] in ("=", "+", "-", "@"):
            return f"'{stripped_value}"
        return value

    def _build_export_response(self, slug: str, queryset: QuerySet | None = None) -> HttpResponse:
        if queryset is None:
            queryset = Issue.issue_objects.filter(**self.filters["base_filters"])
        date_range = None
        if self.filters.get("chart_period_range"):
            start_date, end_date = self.filters["chart_period_range"]
            date_range = (start_date, end_date)
        # build worklogs subquery
        from plane.db.models.worklog import Worklog

        worklogs = Worklog.objects.filter(issue__in=queryset, deleted_at__isnull=True)
        if date_range:
            start, end = date_range
            worklogs = worklogs.filter(logged_at__gte=start, logged_at__lte=end)

        elapsed_minutes = Greatest(
            Cast(Cast(Extract(Now() - F("created_at"), "epoch"), IntegerField()) / Value(60), IntegerField()),
            Value(0),
        )

        issue_hours = list(
            worklogs.values("issue_id")
            .annotate(
                total_minutes=Coalesce(
                    Sum(
                        Case(
                            When(duration=0, then=elapsed_minutes),
                            default=F("duration"),
                            output_field=IntegerField(),
                        )
                    ),
                    Value(0),
                )
            )
            .filter(total_minutes__gt=0)
        )
        issue_ids = [item["issue_id"] for item in issue_hours]
        issues = Issue.issue_objects.filter(id__in=issue_ids).select_related("state").prefetch_related("assignees")
        issue_map = {issue.id: issue for issue in issues}

        # build csv text
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["issue_id", "title", "hours_logged", "status", "priority", "assignee"])
        for item in issue_hours:
            issue = issue_map.get(item["issue_id"])
            if not issue:
                continue
            hours = (item["total_minutes"] or 0) / 60
            assignee_obj = issue.assignees.filter(issue_assignee__deleted_at__isnull=True).first()
            assignee = assignee_obj.display_name if assignee_obj else ""
            writer.writerow(
                [
                    str(issue.id),
                    self._sanitize_csv_cell(issue.name),
                    f"{hours:.2f}",
                    self._sanitize_csv_cell(issue.state.name if issue.state else ""),
                    self._sanitize_csv_cell(issue.priority),
                    self._sanitize_csv_cell(assignee),
                ]
            )
        csv_content = output.getvalue()
        response = HttpResponse(csv_content, content_type="text/csv")
        safe_slug = "".join(char for char in slug if char.isalnum() or char in ("-", "_")) or "workspace"
        response["Content-Disposition"] = f"attachment; filename=hours_logged_{safe_slug}.csv"
        return response

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request: HttpRequest, slug: str) -> HttpResponse:
        self.initialize_workspace(slug, type="chart")
        return self._build_export_response(slug)


class ProjectTimeLoggedExportEndpoint(TimeLoggedExportEndpoint):
    """Project-scoped variant reuses most logic but restricts to a project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request: HttpRequest, slug: str, project_id: str) -> HttpResponse:
        # apply workspace base filters then add project constraint
        self.initialize_workspace(slug, type="chart")
        queryset = Issue.issue_objects.filter(**self.filters["base_filters"]).filter(project_id=project_id)
        return self._build_export_response(slug, queryset=queryset)
