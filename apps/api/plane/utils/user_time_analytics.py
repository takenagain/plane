from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Sequence, Tuple
from uuid import UUID

from django.db.models import (
    Case,
    F,
    IntegerField,
    QuerySet,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Cast, Coalesce, Extract, Greatest, Now
from django.utils import timezone

from plane.db.models import Issue, Worklog, WorkspaceMember
from plane.utils.date_utils import get_analytics_date_range, get_chart_period_range


def _elapsed_minutes_annotation():
    return Greatest(
        Cast(Cast(Extract(Now() - F("created_at"), "epoch"), IntegerField()) / Value(60), IntegerField()),
        Value(0),
    )


def _duration_sum_aggregate():
    elapsed_minutes = _elapsed_minutes_annotation()
    return Coalesce(
        Sum(
            Case(
                When(duration=0, then=elapsed_minutes),
                default=F("duration"),
                output_field=IntegerField(),
            )
        ),
        Value(0),
    )


def parse_project_ids(project_ids_param: Optional[str]) -> Optional[list[UUID]]:
    if not project_ids_param:
        return None
    ids: list[UUID] = []
    for raw in project_ids_param.split(","):
        raw = raw.strip()
        if not raw:
            continue
        ids.append(UUID(raw))
    return ids or None


def get_date_filter_params(request) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    return (
        request.GET.get("date_filter"),
        request.GET.get("start_date"),
        request.GET.get("end_date"),
    )


def base_worklogs(
    slug: str,
    target_user_id: UUID,
    viewer,
    chart_period: Optional[Tuple[date, date]] = None,
    project_ids: Optional[Sequence[UUID]] = None,
) -> QuerySet[Worklog]:
    qs = Worklog.objects.filter(
        deleted_at__isnull=True,
        actor_id=target_user_id,
        issue__workspace__slug=slug,
        issue__project__project_projectmember__member=viewer,
        issue__project__project_projectmember__is_active=True,
        issue__project__archived_at__isnull=True,
    )
    if chart_period:
        start, end = chart_period
        qs = qs.filter(logged_at__gte=start, logged_at__lte=end)
    if project_ids:
        qs = qs.filter(issue__project_id__in=project_ids)
    return qs.distinct()


def user_issues_for_worklogs(worklogs: QuerySet[Worklog]) -> QuerySet[Issue]:
    issue_ids = worklogs.values_list("issue_id", flat=True).distinct()
    return (
        Issue.issue_objects.filter(id__in=issue_ids)
        .select_related("workspace", "state", "project", "type")
        .prefetch_related("assignees", "labels", "issue_module__module", "issue_cycle__cycle")
    )


def aggregate_total_minutes(worklogs: QuerySet[Worklog]) -> int:
    total = worklogs.aggregate(total=_duration_sum_aggregate())["total"]
    return int(total or 0)


def minutes_to_hours(minutes: int) -> float:
    return round((minutes or 0) / 60.0, 2)


def get_summary_periods(
    date_filter: Optional[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[Optional[Tuple[date, date]], Optional[Tuple[date, date]]]:
    chart_period = get_chart_period_range(date_filter)
    if date_filter == "custom" and start_date and end_date:
        try:
            chart_period = (
                datetime.strptime(start_date, "%Y-%m-%d").date(),
                datetime.strptime(end_date, "%Y-%m-%d").date(),
            )
        except (ValueError, TypeError):
            chart_period = None
    analytics_range = get_analytics_date_range(date_filter, start_date, end_date)
    previous_period = None
    if analytics_range and analytics_range.get("previous"):
        prev = analytics_range["previous"]
        previous_period = (prev["gte"].date(), prev["lte"].date())
    return chart_period, previous_period


def period_to_iso_dict(period: Optional[Tuple[date, date]]) -> Optional[dict]:
    if not period:
        return None
    start, end = period
    return {"start": start.isoformat(), "end": end.isoformat()}


def compute_summary(
    slug: str,
    target_user_id: UUID,
    viewer,
    date_filter: Optional[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_ids: Optional[Sequence[UUID]] = None,
) -> dict:
    chart_period, previous_period = get_summary_periods(date_filter, start_date, end_date)
    if chart_period is None:
        chart_period = get_chart_period_range("last_7_days")
    current_worklogs = base_worklogs(slug, target_user_id, viewer, chart_period, project_ids)
    current_minutes = aggregate_total_minutes(current_worklogs)
    worklog_count = current_worklogs.exclude(duration=0).count() + current_worklogs.filter(duration=0).count()
    active_timer_count = current_worklogs.filter(duration=0).count()

    previous_minutes = 0
    if previous_period:
        previous_worklogs = base_worklogs(slug, target_user_id, viewer, previous_period, project_ids)
        previous_minutes = aggregate_total_minutes(previous_worklogs)

    delta_percent = None
    if previous_minutes > 0:
        delta_percent = round(((current_minutes - previous_minutes) / previous_minutes) * 100, 1)
    elif current_minutes > 0 and previous_minutes == 0:
        delta_percent = 100.0

    avg_hours_per_day = 0.0
    if chart_period:
        start, end = chart_period
        day_count = max(1, (end - start).days + 1)
        avg_hours_per_day = round(minutes_to_hours(current_minutes) / day_count, 2)

    return {
        "total_hours": minutes_to_hours(current_minutes),
        "previous_period_hours": minutes_to_hours(previous_minutes),
        "delta_percent": delta_percent,
        "worklog_count": worklog_count,
        "active_timer_count": active_timer_count,
        "avg_hours_per_day": avg_hours_per_day,
        "period": period_to_iso_dict(chart_period) or {"start": "", "end": ""},
        "previous_period": period_to_iso_dict(previous_period),
    }


def build_rankings(
    worklogs: QuerySet[Worklog],
    dimension: str,
    limit: int = 10,
) -> dict:
    limit = min(max(1, limit), 50)
    total_minutes = aggregate_total_minutes(worklogs)
    if total_minutes <= 0:
        return {"dimension": dimension, "items": []}

    duration_agg = _duration_sum_aggregate()

    if dimension == "project":
        rows = (
            worklogs.values("issue__project_id", "issue__project__name")
            .annotate(total=duration_agg)
            .order_by("-total")[:limit]
        )
        items = [
            {
                "id": str(row["issue__project_id"]),
                "name": row["issue__project__name"] or "Unknown",
                "hours": minutes_to_hours(int(row["total"] or 0)),
                "percent_of_total": round((int(row["total"] or 0) / total_minutes) * 100, 1),
            }
            for row in rows
            if row["issue__project_id"]
        ]
    elif dimension == "module":
        module_worklogs = worklogs.filter(issue__issue_module__deleted_at__isnull=True)
        rows = (
            module_worklogs.values("issue__issue_module__module_id", "issue__issue_module__module__name")
            .annotate(total=duration_agg)
            .order_by("-total")[:limit]
        )
        items = [
            {
                "id": str(row["issue__issue_module__module_id"]),
                "name": row["issue__issue_module__module__name"] or "Unknown",
                "hours": minutes_to_hours(int(row["total"] or 0)),
                "percent_of_total": round((int(row["total"] or 0) / total_minutes) * 100, 1),
            }
            for row in rows
            if row["issue__issue_module__module_id"]
        ]
    elif dimension == "cycle":
        cycle_worklogs = worklogs.filter(issue__issue_cycle__deleted_at__isnull=True)
        rows = (
            cycle_worklogs.values("issue__issue_cycle__cycle_id", "issue__issue_cycle__cycle__name")
            .annotate(total=duration_agg)
            .order_by("-total")[:limit]
        )
        items = [
            {
                "id": str(row["issue__issue_cycle__cycle_id"]),
                "name": row["issue__issue_cycle__cycle__name"] or "Unknown",
                "hours": minutes_to_hours(int(row["total"] or 0)),
                "percent_of_total": round((int(row["total"] or 0) / total_minutes) * 100, 1),
            }
            for row in rows
            if row["issue__issue_cycle__cycle_id"]
        ]
    elif dimension == "work_item":
        rows = (
            worklogs.values(
                "issue_id",
                "issue__name",
                "issue__project_id",
                "issue__sequence_id",
                "issue__project__identifier",
            )
            .annotate(total=duration_agg)
            .order_by("-total")[:limit]
        )
        items = []
        for row in rows:
            identifier = None
            if row.get("issue__project__identifier") and row.get("issue__sequence_id"):
                identifier = f"{row['issue__project__identifier']}-{row['issue__sequence_id']}"
            items.append(
                {
                    "id": str(row["issue_id"]),
                    "name": row["issue__name"] or "Unknown",
                    "hours": minutes_to_hours(int(row["total"] or 0)),
                    "percent_of_total": round((int(row["total"] or 0) / total_minutes) * 100, 1),
                    "meta": {
                        "project_id": str(row["issue__project_id"]) if row.get("issue__project_id") else None,
                        "identifier": identifier,
                    },
                }
            )
    else:
        items = []

    return {"dimension": dimension, "items": items}


PROFILE_TIME_ATTENTION_KEYWORDS = (
    "blocked",
    "blocker",
    "bug",
    "regression",
    "urgent",
    "help",
    "stuck",
    "waiting",
)


def build_comment_signals(
    slug: str,
    target_user_id: UUID,
    viewer,
    chart_period: Optional[Tuple[date, date]],
    project_ids: Optional[Sequence[UUID]] = None,
    limit: int = 20,
) -> list:
    from plane.db.models import IssueComment

    worklogs = base_worklogs(slug, target_user_id, viewer, chart_period, project_ids)
    issue_ids = list(worklogs.values_list("issue_id", flat=True).distinct())
    if not issue_ids:
        return []

    hours_by_issue = {
        str(row["issue_id"]): int(row["total"] or 0)
        for row in worklogs.values("issue_id").annotate(total=_duration_sum_aggregate())
    }

    comments_qs = IssueComment.objects.filter(
        issue_id__in=issue_ids,
        deleted_at__isnull=True,
    ).exclude(actor_id=target_user_id)

    if chart_period:
        start, end = chart_period
        start_dt = timezone.make_aware(datetime.combine(start, datetime.min.time()))
        end_dt = timezone.make_aware(datetime.combine(end, datetime.max.time()))
        comments_qs = comments_qs.filter(created_at__gte=start_dt, created_at__lte=end_dt)

    comments_qs = comments_qs.select_related("issue", "issue__project", "actor").order_by("-created_at")[: limit * 3]

    results = []
    for comment in comments_qs:
        text = (comment.comment_stripped or "").lower()
        matched = [kw for kw in PROFILE_TIME_ATTENTION_KEYWORDS if kw in text]
        excerpt = (comment.comment_stripped or "")[:120]
        results.append(
            {
                "issue_id": str(comment.issue_id),
                "issue_name": comment.issue.name,
                "issue_identifier": (
                    f"{comment.issue.project.identifier}-{comment.issue.sequence_id}"
                    if comment.issue.project and comment.issue.sequence_id
                    else None
                ),
                "project_id": str(comment.project_id),
                "project_name": comment.issue.project.name if comment.issue.project else "",
                "comment_excerpt": excerpt,
                "comment_created_at": comment.created_at.isoformat(),
                "comment_actor_name": comment.actor.display_name if comment.actor else "Unknown",
                "matched_keywords": matched,
                "hours_logged_in_period": minutes_to_hours(hours_by_issue.get(str(comment.issue_id), 0)),
            }
        )
        if len(results) >= limit:
            break

    results.sort(key=lambda item: (len(item["matched_keywords"]), item["comment_created_at"]), reverse=True)
    return results[:limit]


def target_user_in_workspace(slug: str, user_id: UUID) -> bool:
    return WorkspaceMember.objects.filter(
        workspace__slug=slug,
        member_id=user_id,
        is_active=True,
        member__is_active=True,
    ).exists()
