import csv
from io import StringIO
from uuid import UUID

from django.db.models import Case, F, IntegerField, Sum, Value, When
from django.db.models.functions import Cast, Coalesce, Extract, Greatest, Now
from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceViewerPermission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, Worklog
from plane.utils.build_chart import build_time_logged_chart
from plane.utils.date_utils import get_chart_period_range
from plane.utils.user_time_analytics import (
    base_worklogs,
    build_comment_signals,
    build_rankings,
    compute_summary,
    get_date_filter_params,
    parse_project_ids,
    target_user_in_workspace,
    user_issues_for_worklogs,
)
class UserTimeAnalyticsBaseView(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def _validate_target_user(self, slug: str, user_id: UUID) -> bool:
        return target_user_in_workspace(slug, user_id)

    def _get_filters(self, request):
        date_filter, start_date, end_date = get_date_filter_params(request)
        project_ids = parse_project_ids(request.GET.get("project_ids"))
        chart_period = get_chart_period_range(date_filter or "last_7_days")
        if date_filter == "custom" and start_date and end_date:
            from datetime import datetime

            try:
                chart_period = (
                    datetime.strptime(start_date, "%Y-%m-%d").date(),
                    datetime.strptime(end_date, "%Y-%m-%d").date(),
                )
            except (ValueError, TypeError):
                chart_period = get_chart_period_range("last_7_days")
        if chart_period is None:
            chart_period = get_chart_period_range("last_7_days")
        return date_filter, start_date, end_date, project_ids, chart_period


class UserTimeAnalyticsSummaryEndpoint(UserTimeAnalyticsBaseView):
    def get(self, request, slug, user_id):
        if not self._validate_target_user(slug, user_id):
            return Response({"error": "User not found in workspace"}, status=status.HTTP_404_NOT_FOUND)

        date_filter, start_date, end_date, project_ids, _ = self._get_filters(request)
        data = compute_summary(
            slug,
            user_id,
            request.user,
            date_filter or "last_7_days",
            start_date,
            end_date,
            project_ids,
        )
        return Response(data, status=status.HTTP_200_OK)


class UserTimeAnalyticsChartsEndpoint(UserTimeAnalyticsBaseView):
    def get(self, request, slug, user_id):
        if not self._validate_target_user(slug, user_id):
            return Response({"error": "User not found in workspace"}, status=status.HTTP_404_NOT_FOUND)

        x_axis = request.GET.get("x_axis")
        group_by = request.GET.get("group_by")
        y_axis = request.GET.get("y_axis", "HOURS_LOGGED")

        if y_axis != "HOURS_LOGGED":
            return Response({"error": "Only HOURS_LOGGED y_axis is supported"}, status=status.HTTP_400_BAD_REQUEST)
        if not x_axis:
            return Response({"error": "x_axis is required"}, status=status.HTTP_400_BAD_REQUEST)

        _, _, _, project_ids, chart_period = self._get_filters(request)
        worklogs = base_worklogs(slug, user_id, request.user, chart_period, project_ids)
        issue_qs = user_issues_for_worklogs(worklogs)
        date_range = chart_period if chart_period else None

        return Response(
            build_time_logged_chart(
                issue_qs,
                x_axis,
                group_by,
                date_range,
                actor_id=str(user_id),
            ),
            status=status.HTTP_200_OK,
        )


class UserTimeAnalyticsRankingsEndpoint(UserTimeAnalyticsBaseView):
    def get(self, request, slug, user_id):
        if not self._validate_target_user(slug, user_id):
            return Response({"error": "User not found in workspace"}, status=status.HTTP_404_NOT_FOUND)

        dimension = request.GET.get("dimension", "project")
        if dimension not in ("project", "module", "cycle", "work_item"):
            return Response({"error": "Invalid dimension"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            limit = int(request.GET.get("limit", 10))
        except (TypeError, ValueError):
            limit = 10

        _, _, _, project_ids, chart_period = self._get_filters(request)
        worklogs = base_worklogs(slug, user_id, request.user, chart_period, project_ids)
        return Response(build_rankings(worklogs, dimension, limit), status=status.HTTP_200_OK)


class UserTimeAnalyticsWorklogsEndpoint(UserTimeAnalyticsBaseView):
    def get(self, request, slug, user_id):
        if not self._validate_target_user(slug, user_id):
            return Response({"error": "User not found in workspace"}, status=status.HTTP_404_NOT_FOUND)

        _, _, _, project_ids, chart_period = self._get_filters(request)
        worklogs = (
            base_worklogs(slug, user_id, request.user, chart_period, project_ids)
            .select_related("issue", "issue__project")
            .order_by("-logged_at", "-created_at")
        )

        try:
            per_page = min(int(request.GET.get("per_page", 20)), 50)
        except (TypeError, ValueError):
            per_page = 20

        cursor = request.GET.get("cursor")
        if cursor:
            worklogs = worklogs.filter(created_at__lt=cursor)

        page = list(worklogs[: per_page + 1])
        next_cursor = None
        if len(page) > per_page:
            next_cursor = page[per_page - 1].created_at.isoformat()
            page = page[:per_page]

        results = []
        for wl in page:
            identifier = None
            if wl.issue.project and wl.issue.sequence_id:
                identifier = f"{wl.issue.project.identifier}-{wl.issue.sequence_id}"
            results.append(
                {
                    "id": str(wl.id),
                    "logged_at": wl.logged_at.isoformat() if wl.logged_at else "",
                    "duration": wl.duration,
                    "description": wl.description or "",
                    "issue": {
                        "id": str(wl.issue_id),
                        "name": wl.issue.name,
                        "identifier": identifier,
                    },
                    "project": {
                        "id": str(wl.project_id),
                        "name": wl.issue.project.name if wl.issue.project else "",
                    },
                }
            )

        return Response({"results": results, "next_cursor": next_cursor}, status=status.HTTP_200_OK)


class UserTimeAnalyticsCommentSignalsEndpoint(UserTimeAnalyticsBaseView):
    def get(self, request, slug, user_id):
        if not self._validate_target_user(slug, user_id):
            return Response({"error": "User not found in workspace"}, status=status.HTTP_404_NOT_FOUND)

        try:
            limit = int(request.GET.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20

        _, _, _, project_ids, chart_period = self._get_filters(request)
        results = build_comment_signals(slug, user_id, request.user, chart_period, project_ids, limit)
        return Response({"results": results}, status=status.HTTP_200_OK)


class UserTimeAnalyticsExportEndpoint(UserTimeAnalyticsBaseView):
    @staticmethod
    def _sanitize_csv_cell(value: str) -> str:
        if not value:
            return ""
        stripped_value = value.lstrip()
        if stripped_value and stripped_value[0] in ("=", "+", "-", "@"):
            return f"'{stripped_value}"
        return value

    def get(self, request, slug, user_id):
        if not self._validate_target_user(slug, user_id):
            return Response({"error": "User not found in workspace"}, status=status.HTTP_404_NOT_FOUND)

        _, _, _, project_ids, chart_period = self._get_filters(request)
        worklogs = base_worklogs(slug, user_id, request.user, chart_period, project_ids)
        issue_qs = user_issues_for_worklogs(worklogs)
        date_range = chart_period

        worklog_qs = Worklog.objects.filter(issue__in=issue_qs, deleted_at__isnull=True, actor_id=user_id)
        if date_range:
            start, end = date_range
            worklog_qs = worklog_qs.filter(logged_at__gte=start, logged_at__lte=end)

        elapsed_minutes = Greatest(
            Cast(Cast(Extract(Now() - F("created_at"), "epoch"), IntegerField()) / Value(60), IntegerField()),
            Value(0),
        )

        issue_hours = list(
            worklog_qs.values("issue_id")
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
        issues = Issue.issue_objects.filter(id__in=issue_ids).select_related("state", "project").prefetch_related(
            "assignees"
        )
        issue_map = {issue.id: issue for issue in issues}

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

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        safe_slug = "".join(char for char in slug if char.isalnum() or char in ("-", "_")) or "workspace"
        response["Content-Disposition"] = f"attachment; filename=hours_logged_{safe_slug}_{user_id}.csv"
        return response
