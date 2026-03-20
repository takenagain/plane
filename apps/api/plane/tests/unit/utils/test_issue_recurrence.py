# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import (
    date,
    datetime,
    timedelta,
    timezone as datetime_timezone,
)

import pytest
from django.test import override_settings

from plane.db.models import Cycle, Project, State, StateGroup
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory
from plane.utils.issue_recurrence import (
    compute_issue_recurrence_next_run_at,
    get_current_recurrence_cycle,
    get_next_recurrence_run_at,
    get_recurrence_occurrence_date,
)


def _create_project(timezone="UTC"):
    workspace = WorkspaceFactory()
    project = ProjectFactory(workspace=workspace, timezone=timezone)
    State.objects.create(
        project=project,
        workspace=workspace,
        name="Todo",
        color="#2563EB",
        group=StateGroup.UNSTARTED.value,
        default=True,
    )
    Project.objects.filter(pk=project.pk).update(default_state=State.objects.filter(project=project).first())
    project.refresh_from_db()
    return project


@pytest.mark.unit
class TestComputeIssueRecurrenceNextRunAt:
    """Tests for compute_issue_recurrence_next_run_at."""

    @pytest.mark.django_db
    def test_daily_pattern_advances_by_one_day(self):
        project = _create_project()
        now = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="daily",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == datetime(2026, 3, 11, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_weekly_pattern_advances_by_seven_days(self):
        project = _create_project()
        now = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="weekly",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == datetime(2026, 3, 17, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_bi_weekly_pattern_advances_by_fourteen_days(self):
        project = _create_project()
        now = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="bi_weekly",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == datetime(2026, 3, 24, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_monthly_pattern_advances_by_one_month(self):
        project = _create_project()
        now = datetime(2026, 3, 15, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 15),
            recurrence_pattern="monthly",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == datetime(2026, 4, 15, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_yearly_pattern_advances_by_one_year(self):
        project = _create_project()
        now = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="yearly",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == datetime(2027, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_compute_next_run_handles_month_end(self):
        """Jan 31 + 1 month = Feb 29 (leap year 2024)."""
        project = _create_project()
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2024, 1, 31),
            recurrence_pattern="monthly",
            recurrence_max_occurrences=None,
            now=datetime(2024, 1, 1, tzinfo=datetime_timezone.utc),
        )
        assert next_run_at == datetime(2024, 2, 29, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_monthly_month_end_non_leap_year(self):
        """Mar 31 + 1 month = Apr 30 (April has only 30 days)."""
        project = _create_project()
        now = datetime(2026, 3, 31, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 31),
            recurrence_pattern="monthly",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == datetime(2026, 4, 30, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_compute_next_run_returns_none_when_recurrence_is_exhausted(self):
        """When generated_count >= max_occurrences, return None immediately."""
        project = _create_project()
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 20),
            recurrence_pattern="weekly",
            recurrence_max_occurrences=3,
            recurrence_generated_count=3,
            now=datetime(2026, 3, 1, tzinfo=datetime_timezone.utc),
        )
        assert next_run_at is None

    @pytest.mark.django_db
    def test_compute_next_run_returns_none_when_no_pattern(self):
        project = _create_project()
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 20),
            recurrence_pattern=None,
            recurrence_max_occurrences=None,
            now=datetime(2026, 3, 1, tzinfo=datetime_timezone.utc),
        )
        assert next_run_at is None

    @pytest.mark.django_db
    def test_compute_next_run_returns_none_when_no_target_date(self):
        project = _create_project()
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=None,
            recurrence_pattern="weekly",
            recurrence_max_occurrences=None,
            now=datetime(2026, 3, 1, tzinfo=datetime_timezone.utc),
        )
        assert next_run_at is None

    @pytest.mark.django_db
    @override_settings(DEBUG=True)
    def test_every_minute_pattern_returns_one_minute_from_now(self):
        project = _create_project()
        now = datetime(2026, 3, 10, 12, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="every_minute",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at == now + timedelta(minutes=1)

    @pytest.mark.django_db
    @override_settings(DEBUG=True)
    def test_once_pattern_returns_target_datetime_when_in_future(self):
        """The 'once' pattern should return the target date midnight in project tz."""
        project = _create_project()
        now = datetime(2026, 3, 10, 6, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 11),
            recurrence_pattern="once",
            recurrence_max_occurrences=None,
            now=now,
        )
        # Target is 2026-03-11 00:00 UTC which is after `now`
        assert next_run_at == datetime(2026, 3, 11, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    @override_settings(DEBUG=True)
    def test_once_pattern_returns_at_least_current_time_when_past(self):
        """If the 'once' anchor is in the past, returns current_time (not the past)."""
        project = _create_project()
        now = datetime(2026, 3, 15, 12, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="once",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at is not None
        assert next_run_at >= now

    @pytest.mark.django_db
    def test_daily_skips_past_occurrences_when_target_date_is_old(self):
        """next_run_at must always be strictly in the future relative to now."""
        project = _create_project()
        now = datetime(2026, 3, 20, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 1),
            recurrence_pattern="daily",
            recurrence_max_occurrences=None,
            now=now,
        )
        assert next_run_at is not None
        assert next_run_at > now  # must be strictly after `now`

    @pytest.mark.django_db
    def test_not_yet_exhausted_still_has_remaining_occurrences(self):
        """When generated_count < max_occurrences, a future run_at is returned."""
        project = _create_project()
        now = datetime(2026, 3, 1, tzinfo=datetime_timezone.utc)
        next_run_at = compute_issue_recurrence_next_run_at(
            project_id=project.id,
            target_date=date(2026, 3, 10),
            recurrence_pattern="weekly",
            recurrence_max_occurrences=5,
            recurrence_generated_count=2,
            now=now,
        )
        assert next_run_at is not None
        assert next_run_at > now  # must be strictly after `now`


@pytest.mark.unit
class TestGetNextRecurrenceRunAt:
    """Tests for get_next_recurrence_run_at (post-creation advancement)."""

    @pytest.mark.django_db
    def test_advances_daily(self):
        project = _create_project()
        current_run = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="daily",
        )
        assert next_run == datetime(2026, 3, 11, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_advances_weekly(self):
        project = _create_project()
        current_run = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="weekly",
        )
        assert next_run == datetime(2026, 3, 17, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_advances_bi_weekly(self):
        project = _create_project()
        current_run = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="bi_weekly",
        )
        assert next_run == datetime(2026, 3, 24, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_advances_monthly(self):
        project = _create_project()
        current_run = datetime(2026, 3, 15, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="monthly",
        )
        assert next_run == datetime(2026, 4, 15, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_get_next_run_handles_leap_year_yearly_pattern(self):
        """Feb 29 in leap year → Feb 28 in non-leap year."""
        project = _create_project()
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=datetime(2024, 2, 29, tzinfo=datetime_timezone.utc),
            recurrence_pattern="yearly",
        )
        assert next_run == datetime(2025, 2, 28, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_get_next_run_monthly_month_end_clamps_to_valid_day(self):
        """Jan 31 → Feb 28/29; Mar 31 → Apr 30."""
        project = _create_project()
        # Mar 31 + 1 month = Apr 30
        current_run = datetime(2026, 3, 31, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="monthly",
        )
        assert next_run == datetime(2026, 4, 30, 0, 0, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_once_pattern_returns_none(self):
        """The 'once' pattern must not schedule another run after the first."""
        project = _create_project()
        current_run = datetime(2026, 3, 10, 0, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="once",
        )
        assert next_run is None

    @pytest.mark.django_db
    @override_settings(DEBUG=True)
    def test_every_minute_advances_by_one_minute(self):
        project = _create_project()
        current_run = datetime(2026, 3, 10, 12, 0, 0, tzinfo=datetime_timezone.utc)
        next_run = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=current_run,
            recurrence_pattern="every_minute",
        )
        assert next_run == datetime(2026, 3, 10, 12, 1, 0, tzinfo=datetime_timezone.utc)

    @pytest.mark.django_db
    def test_returns_none_when_pattern_is_none(self):
        project = _create_project()
        result = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=datetime(2026, 3, 10, tzinfo=datetime_timezone.utc),
            recurrence_pattern=None,
        )
        assert result is None

    @pytest.mark.django_db
    def test_returns_none_when_current_run_at_is_none(self):
        project = _create_project()
        result = get_next_recurrence_run_at(
            project_id=project.id,
            current_run_at=None,
            recurrence_pattern="daily",
        )
        assert result is None


@pytest.mark.unit
class TestGetRecurrenceOccurrenceDate:
    """Tests for get_recurrence_occurrence_date."""

    @pytest.mark.django_db
    def test_returns_date_portion_of_run_at_in_utc_project(self):
        project = _create_project(timezone="UTC")
        run_at = datetime(2026, 3, 17, 0, 0, 0, tzinfo=datetime_timezone.utc)
        occurrence_date = get_recurrence_occurrence_date(project_id=project.id, recurrence_run_at=run_at)
        assert occurrence_date == date(2026, 3, 17)

    @pytest.mark.django_db
    def test_returns_date_converted_to_project_timezone(self):
        """A UTC midnight in a UTC+5:30 project should appear as the same date."""
        project = _create_project(timezone="Asia/Kolkata")
        # 2026-03-17 00:00 UTC is 2026-03-17 05:30 IST — same date
        run_at = datetime(2026, 3, 17, 0, 0, 0, tzinfo=datetime_timezone.utc)
        occurrence_date = get_recurrence_occurrence_date(project_id=project.id, recurrence_run_at=run_at)
        assert occurrence_date == date(2026, 3, 17)

    @pytest.mark.django_db
    def test_date_can_differ_across_timezone_boundary(self):
        """UTC 23:00 on Mar 17 is Mar 18 in UTC+2."""
        project = _create_project(timezone="Europe/Helsinki")  # UTC+2 (winter)
        run_at = datetime(2026, 3, 17, 23, 0, 0, tzinfo=datetime_timezone.utc)
        occurrence_date = get_recurrence_occurrence_date(project_id=project.id, recurrence_run_at=run_at)
        # Helsinki is UTC+2 in March → 23:00 UTC = 01:00 Mar 18 local
        assert occurrence_date == date(2026, 3, 18)


@pytest.mark.unit
class TestGetCurrentRecurrenceCycle:
    """Tests for get_current_recurrence_cycle — especially tie-break ordering."""

    @pytest.mark.django_db
    def test_returns_none_when_no_cycles_exist(self):
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result is None

    @pytest.mark.django_db
    def test_returns_none_when_no_active_cycle(self):
        workspace = WorkspaceFactory()
        owner = UserFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        # Cycle entirely in the past
        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Past cycle",
            start_date=current_time - timedelta(days=30),
            end_date=current_time - timedelta(days=5),
            owned_by=owner,
        )
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result is None

    @pytest.mark.django_db
    def test_returns_single_active_cycle(self):
        workspace = WorkspaceFactory()
        owner = UserFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        active_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Active cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=1),
            owned_by=owner,
        )
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result.id == active_cycle.id

    @pytest.mark.django_db
    def test_tie_break_prefers_earliest_end_date(self):
        """When two cycles overlap, prefer the one ending soonest."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        shorter_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Shorter cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=2),
            owned_by=owner,
        )
        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Longer cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=10),
            owned_by=owner,
        )
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result.id == shorter_cycle.id

    @pytest.mark.django_db
    def test_tie_break_same_end_date_prefers_latest_start_date(self):
        """When end dates are equal, prefer the cycle that started most recently."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        common_end = current_time + timedelta(days=5)

        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Older start",
            start_date=current_time - timedelta(days=10),
            end_date=common_end,
            owned_by=owner,
        )
        later_start_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Later start",
            start_date=current_time - timedelta(days=1),
            end_date=common_end,
            owned_by=owner,
        )
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result.id == later_start_cycle.id

    @pytest.mark.django_db
    def test_archived_cycle_is_excluded(self):
        """Archived cycles must not be returned even when active by date."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Archived active cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=1),
            owned_by=owner,
            archived_at=current_time,
        )
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result is None

    @pytest.mark.django_db
    def test_deleted_cycle_is_excluded(self):
        """Soft-deleted cycles must not be returned even when active by date."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        project = ProjectFactory(workspace=workspace, timezone="UTC")
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Deleted active cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=1),
            owned_by=owner,
            deleted_at=current_time,
        )
        result = get_current_recurrence_cycle(project_id=project.id, current_time=current_time)
        assert result is None
