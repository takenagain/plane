# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
import re
from datetime import datetime, timedelta

import pytz
from celery import shared_task
from django.utils import timezone

from plane.db.models import Cycle, CycleIssue, Project, WorkspaceMember
from plane.utils.cycle_transfer_issues import transfer_cycle_issues
from plane.utils.exception_logger import log_exception

logger = logging.getLogger(__name__)

CYCLE_DURATION_DAYS = 14


def get_fallback_user_id(project):
    """Return project.created_by_id or the first workspace admin as fallback."""
    if project.created_by_id:
        return project.created_by_id
    admin_member = (
        WorkspaceMember.objects.filter(
            workspace=project.workspace,
            role=20,
            is_active=True,
        )
        .order_by("created_at")
        .values_list("member_id", flat=True)
        .first()
    )
    if admin_member:
        return admin_member
    logger.error(
        "No created_by or workspace admin found for project %s; cannot determine owner.",
        project.id,
    )
    return None


def next_sprint_name(project_id):
    """Generate 'Sprint N' where N = max existing sprint number + 1."""
    existing = Cycle.objects.filter(
        project_id=project_id,
        name__regex=r"^Sprint \d+$",
    ).values_list("name", flat=True)
    max_num = 0
    for name in existing:
        match = re.search(r"\d+$", name)
        if match:
            max_num = max(max_num, int(match.group()))
    return f"Sprint {max_num + 1}"


def has_overlapping_cycle(project_id, start_date, end_date):
    """Check if any existing cycle in the project overlaps with the proposed date range."""
    return Cycle.objects.filter(
        project_id=project_id,
        start_date__isnull=False,
        end_date__isnull=False,
        start_date__lte=end_date,
        end_date__gte=start_date,
    ).exists()


def create_upcoming_cycles(project, ended_cycle):
    """Create up to two consecutive two-week cycles after the ended cycle."""
    owner_id = get_fallback_user_id(project)
    if owner_id is None:
        return []

    created_cycle_ids = []
    # Normalize to project-local date to avoid timezone boundary issues
    local_tz = pytz.timezone(project.timezone)
    ended_local_date = ended_cycle.end_date.astimezone(local_tz).date()
    next_start_date = ended_local_date + timedelta(days=1)

    for _ in range(2):
        start_date = local_tz.localize(datetime.combine(next_start_date, datetime.min.time()))
        end_date_local = next_start_date + timedelta(days=CYCLE_DURATION_DAYS - 1)
        end_date = local_tz.localize(datetime.combine(end_date_local, datetime.min.time()))

        if has_overlapping_cycle(project.id, start_date, end_date):
            logger.info(
                "Skipping cycle creation for project %s: overlapping cycle exists for %s - %s",
                project.id,
                start_date,
                end_date,
            )
            next_start_date = end_date_local + timedelta(days=1)
            continue

        name = next_sprint_name(project.id)
        cycle = Cycle(
            name=name,
            project=project,
            workspace=project.workspace,
            start_date=start_date,
            end_date=end_date,
            owned_by_id=owner_id,
            created_by_id=owner_id,
            updated_by_id=owner_id,
        )
        cycle.save(disable_auto_set_user=True)
        created_cycle_ids.append(cycle.id)
        logger.info(
            "Created cycle '%s' (%s) for project %s: %s - %s",
            name,
            cycle.id,
            project.id,
            start_date,
            end_date,
        )
        next_start_date = end_date_local + timedelta(days=1)

    return created_cycle_ids


def transfer_incomplete_issues(project, ended_cycle):
    """Transfer incomplete issues from ended cycle to the next upcoming cycle."""
    user_id = get_fallback_user_id(project)
    if user_id is None:
        logger.warning(
            "No user available for transfer in project %s; skipping.",
            project.id,
        )
        return False

    next_cycle = (
        Cycle.objects.filter(
            project=project,
            start_date__isnull=False,
            end_date__isnull=False,
            start_date__gt=ended_cycle.end_date,
        )
        .order_by("start_date")
        .first()
    )

    if next_cycle is None:
        logger.warning(
            "No upcoming cycle found for project %s after cycle %s; skipping transfer.",
            project.id,
            ended_cycle.id,
        )
        return False

    # Check if there are any incomplete issues to transfer
    incomplete_count = CycleIssue.objects.filter(
        cycle=ended_cycle,
        project=project,
        issue__archived_at__isnull=True,
        issue__is_draft=False,
        issue__state__group__in=["backlog", "unstarted", "started"],
        deleted_at__isnull=True,
        issue__deleted_at__isnull=True,
    ).count()

    if incomplete_count == 0:
        logger.info(
            "No incomplete issues to transfer from cycle %s in project %s.",
            ended_cycle.id,
            project.id,
        )
        return True

    result = transfer_cycle_issues(
        slug=project.workspace.slug,
        project_id=str(project.id),
        cycle_id=str(ended_cycle.id),
        new_cycle_id=str(next_cycle.id),
        request=None,
        user_id=str(user_id),
    )

    if result.get("success"):
        logger.info(
            "Transferred %d incomplete issues from cycle %s to cycle %s in project %s.",
            incomplete_count,
            ended_cycle.id,
            next_cycle.id,
            project.id,
        )
        return True

    logger.error(
        "Failed to transfer issues from cycle %s to cycle %s: %s",
        ended_cycle.id,
        next_cycle.id,
        result.get("error", "unknown error"),
    )
    return False


@shared_task
def process_cycle_automations():
    """
    Daily task to process cycle automations for all qualifying projects.

    1. For projects with auto_create_cycles=True: create next two 2-week cycles
       when a cycle has recently ended.
    2. For projects with auto_transfer_cycle_issues=True: transfer incomplete issues
       from ended cycles to the next upcoming cycle.
    """
    try:
        projects = Project.objects.filter(
            auto_create_cycles=True,
            archived_at__isnull=True,
        ).select_related("workspace", "created_by")

        for project in projects:
            try:
                local_tz = pytz.timezone(project.timezone)
                now_local = timezone.now().astimezone(local_tz)
                yesterday_local = now_local - timedelta(hours=24)

                # Convert back to UTC for DB comparison
                now_utc = now_local.astimezone(pytz.utc)
                yesterday_utc = yesterday_local.astimezone(pytz.utc)

                recently_ended_cycles = Cycle.objects.filter(
                    project=project,
                    end_date__isnull=False,
                    end_date__lt=now_utc,
                    end_date__gte=yesterday_utc,
                ).order_by("end_date")

                for ended_cycle in recently_ended_cycles:
                    # Step 1: Create upcoming cycles
                    create_upcoming_cycles(project, ended_cycle)

                    # Step 2: Transfer incomplete issues (only if enabled)
                    if project.auto_transfer_cycle_issues:
                        transfer_incomplete_issues(project, ended_cycle)

            except Exception as e:
                logger.error(
                    "Error processing cycle automation for project %s: %s",
                    project.id,
                    str(e),
                )
                log_exception(e)
                continue

    except Exception as e:
        log_exception(e)
