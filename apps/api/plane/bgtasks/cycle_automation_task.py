import logging
import re
from datetime import datetime, timedelta

import pytz
from celery import shared_task
from django.utils import timezone

from plane.db.models import Cycle, CycleIssue, Project, WorkspaceMember
from plane.db.models.project import ROLE
from plane.utils.cycle_transfer_issues import transfer_cycle_issues
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")

CYCLE_DURATION_DAYS = 14


def get_fallback_user_id(project):
    """Return project.created_by_id or the first workspace admin as fallback."""
    if project.created_by_id:
        return project.created_by_id
    admin_member = (
        WorkspaceMember.objects.filter(
            workspace=project.workspace,
            role=ROLE.ADMIN.value,
            is_active=True,
        )
        .order_by("created_at")
        .values_list("member_id", flat=True)
        .first()
    )
    if admin_member:
        return admin_member
    logger.error(
        "No created_by or workspace admin found for project; cannot determine owner.",
        extra={"project_id": str(project.id), "skip_reason": "no_owner"},
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
        # Match the conventions used by convert_to_utc:
        # start_date gets 00:00:01 local, end_date gets 23:59:00 local.
        start_date = local_tz.localize(datetime.combine(next_start_date, datetime.min.time()) + timedelta(seconds=1))
        end_date_local = next_start_date + timedelta(days=CYCLE_DURATION_DAYS - 1)
        end_date = local_tz.localize(
            datetime.combine(end_date_local, datetime.min.time()) + timedelta(hours=23, minutes=59)
        )

        if has_overlapping_cycle(project.id, start_date, end_date):
            logger.info(
                "Skipping cycle creation: overlapping cycle exists",
                extra={
                    "project_id": str(project.id),
                    "ended_cycle_id": str(ended_cycle.id),
                    "proposed_start": start_date.isoformat(),
                    "proposed_end": end_date.isoformat(),
                    "skip_reason": "overlapping_cycle",
                },
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
            "Created upcoming cycle",
            extra={
                "project_id": str(project.id),
                "cycle_id": str(cycle.id),
                "cycle_name": name,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        )
        next_start_date = end_date_local + timedelta(days=1)

    return created_cycle_ids


def transfer_incomplete_issues(project, ended_cycle):
    """Transfer incomplete issues from ended cycle to the next upcoming cycle."""
    user_id = get_fallback_user_id(project)
    if user_id is None:
        logger.warning(
            "Cycle issue transfer skipped: no actor available",
            extra={
                "project_id": str(project.id),
                "ended_cycle_id": str(ended_cycle.id),
                "skip_reason": "no_owner",
            },
        )
        return "skipped"

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
            "Cycle issue transfer skipped: no upcoming cycle",
            extra={
                "project_id": str(project.id),
                "ended_cycle_id": str(ended_cycle.id),
                "skip_reason": "no_upcoming_cycle",
            },
        )
        return "skipped"

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
            "Cycle issue transfer skipped: no incomplete issues",
            extra={
                "project_id": str(project.id),
                "ended_cycle_id": str(ended_cycle.id),
                "next_cycle_id": str(next_cycle.id),
                "skip_reason": "no_incomplete_issues",
            },
        )
        return "no_issues"

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
            "Transferred incomplete cycle issues",
            extra={
                "project_id": str(project.id),
                "ended_cycle_id": str(ended_cycle.id),
                "next_cycle_id": str(next_cycle.id),
                "issue_count": incomplete_count,
            },
        )
        return "transferred"

    logger.error(
        "Cycle issue transfer failed",
        extra={
            "project_id": str(project.id),
            "ended_cycle_id": str(ended_cycle.id),
            "next_cycle_id": str(next_cycle.id),
            "skip_reason": "transfer_failed",
            "error": result.get("error", "unknown error"),
        },
    )
    return "failed"


@shared_task
def process_cycle_automations():
    """
    Daily task to process cycle automations for all qualifying projects.

    1. For projects with auto_create_cycles=True: create next two 2-week cycles
       when a cycle has recently ended.
    2. For projects with auto_transfer_cycle_issues=True: transfer incomplete issues
       from ended cycles to the next upcoming cycle.
    """
    summary = {
        "projects_processed": 0,
        "ended_cycles_processed": 0,
        "cycles_created": 0,
        "transfers_succeeded": 0,
        "transfers_skipped": 0,
        "transfers_no_issues": 0,
        "transfers_failed": 0,
        "project_errors": 0,
    }

    try:
        projects = Project.objects.filter(
            auto_create_cycles=True,
            archived_at__isnull=True,
        ).select_related("workspace", "created_by")

        for project in projects:
            try:
                summary["projects_processed"] += 1
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
                    summary["ended_cycles_processed"] += 1

                    # Step 1: Create upcoming cycles
                    created_ids = create_upcoming_cycles(project, ended_cycle)
                    summary["cycles_created"] += len(created_ids)

                    # Step 2: Transfer incomplete issues (only if enabled)
                    if project.auto_transfer_cycle_issues:
                        transfer_result = transfer_incomplete_issues(project, ended_cycle)
                        if transfer_result == "transferred":
                            summary["transfers_succeeded"] += 1
                        elif transfer_result == "no_issues":
                            summary["transfers_no_issues"] += 1
                        elif transfer_result == "failed":
                            summary["transfers_failed"] += 1
                        else:
                            summary["transfers_skipped"] += 1

            except Exception as e:
                summary["project_errors"] += 1
                logger.error(
                    "Error processing cycle automation for project",
                    extra={"project_id": str(project.id), "error": str(e)},
                )
                log_exception(e)
                continue

    except Exception as e:
        log_exception(e)
    finally:
        logger.info("Cycle automation processing completed", extra={"cycle_automation_summary": summary})

    return summary
