# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import logging

from celery import shared_task
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue
from plane.utils.issue_recurrence import (
    create_recurrence_duplicate,
    get_allowed_recurrence_patterns,
    get_current_recurrence_cycle,
    get_next_recurrence_run_at,
    get_recurrence_occurrence_date,
    is_recurrence_exhausted,
)

RECURRENCE_BATCH_SIZE = 100
logger = logging.getLogger("plane.worker")


@shared_task
def process_recurring_issues(batch_size=RECURRENCE_BATCH_SIZE):
    current_time = timezone.now()
    summary = {
        "scanned": 0,
        "created": 0,
        "exhausted": 0,
        "skipped": 0,
        "failed": 0,
        "without_cycle": 0,
    }

    while True:
        batch_summary = _process_recurrence_batch(batch_size=batch_size, current_time=current_time)
        if batch_summary["scanned"] == 0:
            break

        for key, value in batch_summary.items():
            summary[key] += value

        # Terminate if no forward progress was made (all items failed)
        if batch_summary["created"] == 0 and batch_summary["exhausted"] == 0 and batch_summary["skipped"] == 0:
            break

    logger.info("Recurring issue processing completed", extra={"recurring_issue_summary": summary})
    return summary


def _process_recurrence_batch(*, batch_size, current_time):
    batch_summary = {
        "scanned": 0,
        "created": 0,
        "exhausted": 0,
        "skipped": 0,
        "failed": 0,
        "without_cycle": 0,
    }

    with transaction.atomic():
        due_sources = list(
            Issue.objects.select_for_update(skip_locked=True, of=("self",))
            .select_related("project", "project__default_state", "state", "estimate_point", "type")
            .filter(
                deleted_at__isnull=True,
                project__archived_at__isnull=True,
                archived_at__isnull=True,
                is_draft=False,
                recurrence_pattern__in=get_allowed_recurrence_patterns(),
                recurrence_source_issue__isnull=True,
                recurrence_next_run_at__isnull=False,
                recurrence_next_run_at__lte=current_time,
            )
            .order_by("recurrence_next_run_at", "id")[:batch_size]
        )

        if not due_sources:
            return batch_summary

        batch_summary["scanned"] = len(due_sources)

        for source_issue in due_sources:
            try:
                with transaction.atomic():
                    if not _is_recurrence_source_eligible(source_issue=source_issue, current_time=current_time):
                        batch_summary["skipped"] += 1
                        continue

                    if is_recurrence_exhausted(source_issue):
                        source_issue.recurrence_pattern = None
                        source_issue.recurrence_max_occurrences = None
                        source_issue.recurrence_next_run_at = None
                        source_issue.save(
                            update_fields=[
                                "recurrence_pattern",
                                "recurrence_max_occurrences",
                                "recurrence_next_run_at",
                            ],
                            disable_auto_set_user=True,
                        )
                        batch_summary["exhausted"] += 1
                        continue

                    occurrence_date = get_recurrence_occurrence_date(
                        project_id=source_issue.project_id,
                        recurrence_run_at=source_issue.recurrence_next_run_at,
                    )
                    current_cycle = get_current_recurrence_cycle(
                        project_id=source_issue.project_id,
                        current_time=current_time,
                    )
                    duplicate_issue = create_recurrence_duplicate(
                        source_issue=source_issue,
                        occurrence_date=occurrence_date,
                        cycle=current_cycle,
                    )

                    issue_activity.delay(
                        type="issue.activity.created",
                        requested_data=json.dumps(
                            {
                                "automation": True,
                                "recurrence_source_issue_id": str(source_issue.id),
                                "target_date": str(occurrence_date),
                            },
                            cls=DjangoJSONEncoder,
                        ),
                        actor_id=str(
                            source_issue.updated_by_id
                            or source_issue.created_by_id
                            or source_issue.project.created_by_id
                        ),
                        issue_id=str(duplicate_issue.id),
                        project_id=str(source_issue.project_id),
                        current_instance=None,
                        epoch=int(current_time.timestamp()),
                    )

                    source_issue.recurrence_generated_count += 1
                    source_issue.recurrence_last_run_at = current_time

                    if is_recurrence_exhausted(source_issue):
                        source_issue.recurrence_pattern = None
                        source_issue.recurrence_max_occurrences = None
                        source_issue.recurrence_next_run_at = None
                        batch_summary["exhausted"] += 1
                    else:
                        next_run = get_next_recurrence_run_at(
                            project_id=source_issue.project_id,
                            current_run_at=source_issue.recurrence_next_run_at,
                            recurrence_pattern=source_issue.recurrence_pattern,
                        )
                        source_issue.recurrence_next_run_at = next_run
                        if next_run is None:
                            # Pattern exhausted naturally (e.g. "once" cadence)
                            source_issue.recurrence_pattern = None
                            source_issue.recurrence_max_occurrences = None
                            batch_summary["exhausted"] += 1

                    source_issue.save(
                        update_fields=[
                            "recurrence_pattern",
                            "recurrence_max_occurrences",
                            "recurrence_generated_count",
                            "recurrence_last_run_at",
                            "recurrence_next_run_at",
                        ],
                        disable_auto_set_user=True,
                    )
                    batch_summary["created"] += 1
                    if current_cycle is None:
                        batch_summary["without_cycle"] += 1
            except Exception:
                batch_summary["failed"] += 1
                logger.exception(
                    "Recurring issue processing failed",
                    extra={
                        "recurrence_source_issue_id": str(source_issue.id),
                        "project_id": str(source_issue.project_id),
                        "recurrence_pattern": source_issue.recurrence_pattern,
                    },
                )
                continue

    return batch_summary


def _is_recurrence_source_eligible(*, source_issue, current_time):
    return bool(
        source_issue.recurrence_pattern
        and source_issue.recurrence_source_issue_id is None
        and source_issue.recurrence_next_run_at
        and source_issue.recurrence_next_run_at <= current_time
        and source_issue.archived_at is None
        and not source_issue.is_draft
    )
