# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from copy import deepcopy
from datetime import datetime, time, timedelta

import pytz
from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    StateGroup,
)

PRODUCTION_RECURRENCE_PATTERNS = frozenset({"daily", "weekly", "bi_weekly", "monthly", "yearly"})
TEST_ONLY_RECURRENCE_PATTERNS = frozenset({"every_minute", "once"})
RECURRENCE_CONFIG_FIELDS = frozenset({"target_date", "recurrence_pattern", "recurrence_max_occurrences"})
ACTIVE_STATE_GROUPS = frozenset(
    {
        StateGroup.BACKLOG.value,
        StateGroup.UNSTARTED.value,
        StateGroup.STARTED.value,
    }
)
CLOSED_STATE_GROUPS = frozenset({StateGroup.COMPLETED.value, StateGroup.CANCELLED.value})


def are_test_recurrence_patterns_enabled():
    return bool(settings.DEBUG)


def get_allowed_recurrence_patterns():
    if are_test_recurrence_patterns_enabled():
        return PRODUCTION_RECURRENCE_PATTERNS | TEST_ONLY_RECURRENCE_PATTERNS
    return PRODUCTION_RECURRENCE_PATTERNS


def should_recompute_issue_recurrence(validated_data, instance=None):
    return instance is None or any(field in validated_data for field in RECURRENCE_CONFIG_FIELDS)


def get_effective_issue_recurrence_values(validated_data, instance=None):
    return {
        "target_date": validated_data.get("target_date", getattr(instance, "target_date", None)),
        "recurrence_pattern": validated_data.get("recurrence_pattern", getattr(instance, "recurrence_pattern", None)),
        "recurrence_max_occurrences": validated_data.get(
            "recurrence_max_occurrences",
            getattr(instance, "recurrence_max_occurrences", None),
        ),
        "recurrence_generated_count": getattr(instance, "recurrence_generated_count", 0),
    }


def get_issue_recurrence_validation_error(*, recurrence_pattern, target_date, recurrence_max_occurrences, **_kwargs):
    if not recurrence_pattern:
        return None

    if target_date is None:
        return {"recurrence_pattern": "Repeat requires a due date."}

    if recurrence_pattern not in get_allowed_recurrence_patterns():
        return {"recurrence_pattern": "Repeat option is not available in this environment."}

    if recurrence_max_occurrences is not None and recurrence_max_occurrences < 1:
        return {"recurrence_max_occurrences": "Max repetitions must be a positive integer."}

    return None


def compute_issue_recurrence_next_run_at(
    *,
    project_id,
    target_date,
    recurrence_pattern,
    recurrence_max_occurrences,
    recurrence_generated_count=0,
    now=None,
):
    if not recurrence_pattern or target_date is None:
        return None

    if recurrence_max_occurrences is not None and recurrence_generated_count >= recurrence_max_occurrences:
        return None

    current_time = now or timezone.now()

    if recurrence_pattern == "every_minute":
        return current_time + timedelta(minutes=1)

    project_timezone = _get_project_timezone(project_id)
    anchor_local_datetime = _build_project_local_datetime(target_date, project_timezone)

    if recurrence_pattern == "once":
        once_run_at = anchor_local_datetime.astimezone(pytz.utc)
        return max(once_run_at, current_time)

    next_local_datetime = _advance_recurrence_datetime(anchor_local_datetime, recurrence_pattern)
    next_run_at = next_local_datetime.astimezone(pytz.utc)

    while next_run_at <= current_time:
        next_local_datetime = _advance_recurrence_datetime(next_local_datetime, recurrence_pattern)
        next_run_at = next_local_datetime.astimezone(pytz.utc)

    return next_run_at


def get_next_recurrence_run_at(*, project_id, current_run_at, recurrence_pattern):
    if not recurrence_pattern or current_run_at is None or recurrence_pattern == "once":
        return None

    if recurrence_pattern == "every_minute":
        return current_run_at + timedelta(minutes=1)

    project_timezone = _get_project_timezone(project_id)
    current_local_datetime = current_run_at.astimezone(project_timezone)
    next_local_datetime = _advance_recurrence_datetime(current_local_datetime, recurrence_pattern)
    return next_local_datetime.astimezone(pytz.utc)


def get_recurrence_occurrence_date(*, project_id, recurrence_run_at):
    project_timezone = _get_project_timezone(project_id)
    return recurrence_run_at.astimezone(project_timezone).date()


def is_recurrence_exhausted(issue):
    return (
        issue.recurrence_max_occurrences is not None
        and issue.recurrence_generated_count >= issue.recurrence_max_occurrences
    )


def get_current_recurrence_cycle(*, project_id, current_time=None):
    active_at = current_time or timezone.now()
    return (
        Cycle.objects.filter(
            project_id=project_id,
            archived_at__isnull=True,
            deleted_at__isnull=True,
            start_date__lte=active_at,
            end_date__gte=active_at,
        )
        .order_by("end_date", "-start_date", "id")
        .first()
    )


def create_recurrence_duplicate(*, source_issue, occurrence_date, cycle=None):
    duplicate_issue = Issue(
        project=source_issue.project,
        state=get_recurrence_duplicate_state(project=source_issue.project, source_state=source_issue.state),
        point=source_issue.point,
        estimate_point=source_issue.estimate_point,
        name=source_issue.name,
        description_json=deepcopy(source_issue.description_json),
        description_html=source_issue.description_html,
        description_binary=source_issue.description_binary,
        priority=source_issue.priority,
        start_date=get_recurrence_duplicate_start_date(),
        target_date=occurrence_date,
        recurrence_source_issue=source_issue,
        type=source_issue.type,
        is_draft=False,
    )
    duplicate_issue.created_by_id = source_issue.created_by_id
    duplicate_issue.updated_by_id = source_issue.updated_by_id
    duplicate_issue.save(disable_auto_set_user=True)

    _copy_recurrence_duplicate_assignees(source_issue=source_issue, duplicate_issue=duplicate_issue)
    _copy_recurrence_duplicate_labels(source_issue=source_issue, duplicate_issue=duplicate_issue)
    _copy_recurrence_duplicate_modules(source_issue=source_issue, duplicate_issue=duplicate_issue)

    if cycle:
        CycleIssue.objects.create(
            cycle=cycle,
            issue=duplicate_issue,
            project_id=duplicate_issue.project_id,
            workspace_id=duplicate_issue.workspace_id,
            created_by_id=source_issue.created_by_id,
            updated_by_id=source_issue.updated_by_id,
        )

    return duplicate_issue


def get_recurrence_duplicate_state(*, project, source_state):
    if source_state and source_state.group not in CLOSED_STATE_GROUPS:
        return source_state

    default_state = getattr(project, "default_state", None)
    if default_state and default_state.group in ACTIVE_STATE_GROUPS:
        return default_state

    return (
        State.objects.filter(project_id=project.id, group__in=ACTIVE_STATE_GROUPS)
        .order_by("-default", "sequence", "created_at", "id")
        .first()
    )


def get_recurrence_duplicate_start_date():
    return None


def _copy_recurrence_duplicate_assignees(*, source_issue, duplicate_issue):
    valid_assignee_ids = list(
        ProjectMember.objects.filter(
            project_id=source_issue.project_id,
            is_active=True,
            role__gte=15,
            member_id__in=IssueAssignee.objects.filter(issue=source_issue).values_list("assignee_id", flat=True),
        ).values_list("member_id", flat=True)
    )

    if not valid_assignee_ids:
        return

    IssueAssignee.objects.bulk_create(
        [
            IssueAssignee(
                issue=duplicate_issue,
                assignee_id=assignee_id,
                project_id=duplicate_issue.project_id,
                workspace_id=duplicate_issue.workspace_id,
                created_by_id=source_issue.created_by_id,
                updated_by_id=source_issue.updated_by_id,
            )
            for assignee_id in valid_assignee_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def _copy_recurrence_duplicate_labels(*, source_issue, duplicate_issue):
    label_ids = list(IssueLabel.objects.filter(issue=source_issue).values_list("label_id", flat=True))
    if not label_ids:
        return

    IssueLabel.objects.bulk_create(
        [
            IssueLabel(
                issue=duplicate_issue,
                label_id=label_id,
                project_id=duplicate_issue.project_id,
                workspace_id=duplicate_issue.workspace_id,
                created_by_id=source_issue.created_by_id,
                updated_by_id=source_issue.updated_by_id,
            )
            for label_id in label_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def _copy_recurrence_duplicate_modules(*, source_issue, duplicate_issue):
    module_ids = list(ModuleIssue.objects.filter(issue=source_issue).values_list("module_id", flat=True))
    if not module_ids:
        return

    ModuleIssue.objects.bulk_create(
        [
            ModuleIssue(
                issue=duplicate_issue,
                module_id=module_id,
                project_id=duplicate_issue.project_id,
                workspace_id=duplicate_issue.workspace_id,
                created_by_id=source_issue.created_by_id,
                updated_by_id=source_issue.updated_by_id,
            )
            for module_id in module_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def _get_project_timezone(project_id):
    project_timezone = Project.objects.only("timezone").get(pk=project_id).timezone or "UTC"
    return pytz.timezone(project_timezone)


def _build_project_local_datetime(target_date, project_timezone):
    naive_datetime = datetime.combine(target_date, time.min)
    return project_timezone.localize(naive_datetime)


def _advance_recurrence_datetime(local_datetime, recurrence_pattern):
    if recurrence_pattern == "daily":
        return local_datetime + timedelta(days=1)
    if recurrence_pattern == "weekly":
        return local_datetime + timedelta(weeks=1)
    if recurrence_pattern == "bi_weekly":
        return local_datetime + timedelta(weeks=2)
    if recurrence_pattern == "monthly":
        return local_datetime + relativedelta(months=1)
    if recurrence_pattern == "yearly":
        return local_datetime + relativedelta(years=1)

    raise ValueError(f"Unsupported recurrence pattern: {recurrence_pattern}")
