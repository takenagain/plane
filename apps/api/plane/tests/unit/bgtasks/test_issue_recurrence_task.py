import json
import threading
from datetime import (
    date,
    datetime,
    timedelta,
    timezone as datetime_timezone,
)
from unittest.mock import patch

import pytest

from plane.bgtasks.issue_recurrence_task import _process_recurrence_batch
from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    StateGroup,
)
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_project_context():
    workspace = WorkspaceFactory()
    project = ProjectFactory(workspace=workspace, timezone="UTC")
    default_state = State.objects.create(
        project=project,
        workspace=workspace,
        name="Todo",
        color="#2563EB",
        group=StateGroup.UNSTARTED.value,
        default=True,
    )
    completed_state = State.objects.create(
        project=project,
        workspace=workspace,
        name="Done",
        color="#16A34A",
        group=StateGroup.COMPLETED.value,
        default=False,
    )
    Project.objects.filter(pk=project.pk).update(default_state=default_state)
    project.refresh_from_db()
    return workspace, project, default_state, completed_state


def _create_issue(*, project, workspace, state, name, recurrence_pattern, recurrence_next_run_at, **extra_fields):
    issue = Issue(
        project=project,
        workspace=workspace,
        state=state,
        name=name,
        target_date=extra_fields.pop("target_date", recurrence_next_run_at.date()),
        recurrence_pattern=recurrence_pattern,
        recurrence_next_run_at=recurrence_next_run_at,
        **extra_fields,
    )
    issue.save(disable_auto_set_user=True)
    return issue


# ---------------------------------------------------------------------------
# Core creation and relation copying
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceTask:
    @pytest.mark.django_db(transaction=True)
    def test_process_batch_creates_duplicate_copies_relations_and_assigns_current_cycle(self):
        workspace, project, default_state, completed_state = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=completed_state,
            name="Recurring source",
            target_date=date(2026, 3, 10),
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
        )

        source_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Source cycle",
            start_date=current_time - timedelta(days=30),
            end_date=current_time - timedelta(days=15),
            owned_by=workspace.owner,
        )
        preferred_current_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Current cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=1),
            owned_by=workspace.owner,
        )
        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Long cycle",
            start_date=current_time - timedelta(days=2),
            end_date=current_time + timedelta(days=5),
            owned_by=workspace.owner,
        )
        CycleIssue.objects.create(
            cycle=source_cycle,
            issue=source_issue,
            project=project,
            workspace=workspace,
        )

        assignee = UserFactory()
        ProjectMember.objects.create(project=project, workspace=workspace, member=assignee, role=15, is_active=True)
        IssueAssignee.objects.create(
            issue=source_issue,
            assignee=assignee,
            project=project,
            workspace=workspace,
        )

        label = Label.objects.create(project=project, workspace=workspace, name="Recurring", color="#9333EA")
        IssueLabel.objects.create(issue=source_issue, label=label, project=project, workspace=workspace)

        module = Module.objects.create(project=project, workspace=workspace, name="Automation")
        ModuleIssue.objects.create(issue=source_issue, module=module, project=project, workspace=workspace)

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay") as issue_activity_delay:
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        source_issue.refresh_from_db()
        duplicate_issue = Issue.objects.get(recurrence_source_issue=source_issue)
        activity_payload = json.loads(issue_activity_delay.call_args.kwargs["requested_data"])

        assert summary == {
            "scanned": 1,
            "created": 1,
            "exhausted": 0,
            "skipped": 0,
            "failed": 0,
            "without_cycle": 0,
        }
        assert duplicate_issue.state_id == default_state.id
        assert duplicate_issue.target_date == current_time.date()
        assert duplicate_issue.start_date is None
        assert duplicate_issue.recurrence_pattern is None
        assert duplicate_issue.recurrence_source_issue_id == source_issue.id
        assert list(duplicate_issue.assignees.values_list("id", flat=True)) == [assignee.id]
        assert list(duplicate_issue.labels.values_list("id", flat=True)) == [label.id]
        assert list(duplicate_issue.issue_module.values_list("module_id", flat=True)) == [module.id]
        assert list(duplicate_issue.issue_cycle.values_list("cycle_id", flat=True)) == [preferred_current_cycle.id]
        assert source_issue.recurrence_generated_count == 1
        assert source_issue.recurrence_last_run_at == current_time
        assert source_issue.recurrence_next_run_at == current_time + timedelta(weeks=1)
        assert activity_payload["automation"] is True
        assert activity_payload["recurrence_source_issue_id"] == str(source_issue.id)
        assert activity_payload["target_date"] == str(current_time.date())

    @pytest.mark.django_db
    def test_process_batch_marks_source_exhausted_and_tracks_missing_cycle(self):
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
            recurrence_max_occurrences=1,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        source_issue.refresh_from_db()
        duplicate_issue = Issue.objects.get(recurrence_source_issue=source_issue)

        assert summary == {
            "scanned": 1,
            "created": 1,
            "exhausted": 1,
            "skipped": 0,
            "failed": 0,
            "without_cycle": 1,
        }
        assert source_issue.recurrence_generated_count == 1
        assert source_issue.recurrence_pattern is None
        assert source_issue.recurrence_max_occurrences is None
        assert source_issue.recurrence_next_run_at is None
        assert duplicate_issue.state_id == default_state.id
        assert duplicate_issue.issue_cycle.count() == 0

    @pytest.mark.django_db
    def test_process_batch_is_idempotent_after_advancing_next_run(self):
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            first_summary = _process_recurrence_batch(batch_size=10, current_time=current_time)
            second_summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert first_summary["created"] == 1
        assert second_summary["scanned"] == 0
        assert second_summary["created"] == 0
        assert Issue.objects.filter(recurrence_source_issue=source_issue).count() == 1


# ---------------------------------------------------------------------------
# Duplicate field inheritance
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceDuplicateFields:
    @pytest.mark.django_db
    def test_duplicate_does_not_inherit_recurrence_settings(self):
        """The generated duplicate must not carry any active recurrence config."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
            recurrence_max_occurrences=5,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.recurrence_pattern is None
        assert duplicate.recurrence_next_run_at is None
        assert duplicate.recurrence_max_occurrences is None
        assert duplicate.recurrence_generated_count == 0

    @pytest.mark.django_db
    def test_duplicate_start_date_is_null_even_when_source_has_start_date(self):
        """start_date must be cleared (None) on the duplicate per spec decision."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source with start date",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
            start_date=date(2026, 3, 1),
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.start_date is None

    @pytest.mark.django_db
    def test_duplicate_inherits_name_and_priority_from_source(self):
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Critical weekly review",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
            priority="high",
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.name == "Critical weekly review"
        assert duplicate.priority == "high"

    @pytest.mark.django_db
    def test_duplicate_is_not_a_draft(self):
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.is_draft is False

    @pytest.mark.django_db
    def test_duplicate_target_date_equals_occurrence_date(self):
        """The duplicate's target_date must be the date portion of next_run_at
        (converted to the project's timezone, which is UTC here)."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 5, 15, 0, 0, 0, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="monthly",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.target_date == date(2026, 5, 15)


# ---------------------------------------------------------------------------
# State resolution on duplicate
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceDuplicateStateResolution:
    @pytest.mark.django_db
    def test_duplicate_uses_source_state_when_source_is_active(self):
        """If the source issue is in an active (non-closed) state, the duplicate
        should reuse that state."""
        workspace, project, default_state, _ = _create_project_context()
        started_state = State.objects.create(
            project=project,
            workspace=workspace,
            name="In Progress",
            color="#F59E0B",
            group=StateGroup.STARTED.value,
            default=False,
        )
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=started_state,
            name="In-progress recurring",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.state_id == started_state.id

    @pytest.mark.django_db
    def test_duplicate_uses_default_state_when_source_is_in_completed_state(self):
        """If the source issue is completed or cancelled, the duplicate should
        fall back to the project's default state."""
        workspace, project, default_state, completed_state = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=completed_state,
            name="Done but recurring",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert duplicate.state_id == default_state.id


# ---------------------------------------------------------------------------
# Eligibility / skipping conditions
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceEligibility:
    @pytest.mark.django_db
    def test_archived_source_issue_is_not_processed(self):
        """An archived source issue must be excluded from the batch query and
        must not generate a duplicate."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Archived recurring",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
            # archived_at is a DateField on Issue
            archived_at=current_time.date(),
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["scanned"] == 0
        assert summary["created"] == 0
        assert Issue.objects.filter(recurrence_source_issue=source_issue).count() == 0

    @pytest.mark.django_db
    def test_draft_source_issue_is_not_processed(self):
        """A draft issue must be excluded from the batch query."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Draft recurring",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
            is_draft=True,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["scanned"] == 0
        assert summary["created"] == 0
        assert Issue.objects.filter(recurrence_source_issue=source_issue).count() == 0

    @pytest.mark.django_db
    def test_generated_duplicate_is_not_reprocessed_as_source(self):
        """A duplicate that already has recurrence_source_issue set must never
        be picked up as a new recurrence source."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        # Create the original source
        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Original source",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        # Manually create a duplicate that incorrectly has a recurrence pattern
        # and a past next_run_at (simulates a bug scenario)
        fake_duplicate = Issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Fake duplicate",
            target_date=current_time.date(),
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
            recurrence_source_issue=source_issue,
        )
        fake_duplicate.save(disable_auto_set_user=True)

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        # Only the original source (not the fake duplicate) should be scanned
        assert summary["scanned"] == 1
        assert Issue.objects.filter(recurrence_source_issue=source_issue).count() >= 1
        # The fake_duplicate itself must never have spawned another duplicate
        assert Issue.objects.filter(recurrence_source_issue=fake_duplicate).count() == 0

    @pytest.mark.django_db
    def test_source_with_null_next_run_at_is_not_processed(self):
        """An issue with recurrence_next_run_at=None should be excluded."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        source_issue = Issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="No next run",
            target_date=current_time.date(),
            recurrence_pattern="daily",
            recurrence_next_run_at=None,
        )
        source_issue.save(disable_auto_set_user=True)

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["scanned"] == 0

    @pytest.mark.django_db
    def test_source_not_yet_due_is_not_processed(self):
        """An issue whose next_run_at is in the future must not be processed."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)
        future_run = current_time + timedelta(hours=1)

        _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Not yet due",
            recurrence_pattern="daily",
            recurrence_next_run_at=future_run,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["scanned"] == 0


# ---------------------------------------------------------------------------
# Exhaustion behaviour
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceExhaustion:
    @pytest.mark.django_db
    def test_exhausted_before_creation_clears_next_run_without_creating_duplicate(self):
        """If max_occurrences is already reached before the batch runs (e.g. set
        externally), no duplicate should be created and next_run_at cleared."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Already exhausted",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
            recurrence_max_occurrences=2,
            recurrence_generated_count=2,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        source_issue.refresh_from_db()
        assert summary["scanned"] == 1
        assert summary["exhausted"] == 1
        assert summary["created"] == 0
        assert source_issue.recurrence_pattern is None
        assert source_issue.recurrence_max_occurrences is None
        assert source_issue.recurrence_next_run_at is None
        assert Issue.objects.filter(recurrence_source_issue=source_issue).count() == 0

    @pytest.mark.django_db
    def test_exhaustion_after_final_creation_nulls_next_run(self):
        """After creating the last allowed duplicate (count reaches max),
        next_run_at must become None."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Last run",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
            recurrence_max_occurrences=3,
            recurrence_generated_count=2,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        source_issue.refresh_from_db()
        assert summary["created"] == 1
        assert summary["exhausted"] == 1
        assert source_issue.recurrence_pattern is None
        assert source_issue.recurrence_max_occurrences is None
        assert source_issue.recurrence_next_run_at is None
        assert source_issue.recurrence_generated_count == 3

    @pytest.mark.django_db
    def test_infinite_recurrence_continues_after_creation(self):
        """When max_occurrences is None (infinite), next_run_at must be
        advanced, not cleared."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Infinite recurring",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        source_issue.refresh_from_db()
        assert summary["created"] == 1
        assert summary["exhausted"] == 0
        assert source_issue.recurrence_next_run_at is not None
        assert source_issue.recurrence_next_run_at > current_time


# ---------------------------------------------------------------------------
# Cycle assignment
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceCycleAssignment:
    @pytest.mark.django_db
    def test_duplicate_is_assigned_to_current_cycle_not_source_cycle(self):
        """The duplicate must be placed in the cycle that is active at generation
        time, not the cycle the source issue belongs to."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        source_issue = _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
        )

        # The source was in a past cycle
        past_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Past cycle",
            start_date=current_time - timedelta(days=30),
            end_date=current_time - timedelta(days=2),
            owned_by=workspace.owner,
        )
        CycleIssue.objects.create(
            cycle=past_cycle,
            issue=source_issue,
            project=project,
            workspace=workspace,
        )

        # Active cycle at generation time
        current_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Current cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=6),
            owned_by=workspace.owner,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert list(duplicate.issue_cycle.values_list("cycle_id", flat=True)) == [current_cycle.id]

    @pytest.mark.django_db
    def test_without_cycle_counter_incremented_when_no_active_cycle(self):
        """If there is no active cycle at generation time, without_cycle must
        be incremented and the duplicate still created."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="No cycle source",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["created"] == 1
        assert summary["without_cycle"] == 1

    @pytest.mark.django_db
    def test_overlapping_cycles_tie_break_by_earliest_end_date(self):
        """When multiple cycles are active, the one with the earliest end_date
        is selected (spec tie-break rule)."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
        )

        shorter_cycle = Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Shorter cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=2),
            owned_by=workspace.owner,
        )
        Cycle.objects.create(
            project=project,
            workspace=workspace,
            name="Longer cycle",
            start_date=current_time - timedelta(days=1),
            end_date=current_time + timedelta(days=10),
            owned_by=workspace.owner,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            _process_recurrence_batch(batch_size=10, current_time=current_time)

        source_issue = Issue.objects.get(recurrence_source_issue__isnull=True, recurrence_pattern="weekly")
        duplicate = Issue.objects.get(recurrence_source_issue=source_issue)
        assert list(duplicate.issue_cycle.values_list("cycle_id", flat=True)) == [shorter_cycle.id]


# ---------------------------------------------------------------------------
# Error handling and resilience
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceTaskResilience:
    @pytest.mark.django_db
    def test_failed_issue_increments_failed_counter_and_continues_batch(self):
        """If one issue raises an exception during processing, the batch should
        continue and the failed counter should be incremented."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        # First issue will fail (created in DB; variable unused after creation)
        _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Will fail",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )
        # Second issue should succeed
        _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Will succeed",
            recurrence_pattern="daily",
            recurrence_next_run_at=current_time,
        )

        call_count = {"n": 0}

        def patched_create(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("Simulated failure")
            from plane.utils.issue_recurrence import create_recurrence_duplicate as real_fn

            return real_fn(*args, **kwargs)

        with (
            patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"),
            patch(
                "plane.bgtasks.issue_recurrence_task.create_recurrence_duplicate",
                side_effect=patched_create,
            ),
        ):
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["scanned"] == 2
        assert summary["failed"] == 1
        assert summary["created"] == 1

    @pytest.mark.django_db(transaction=True)
    def test_activity_delay_called_once_per_created_duplicate(self):
        """issue_activity.delay must be called exactly once for each successfully
        created duplicate."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        for i in range(3):
            _create_issue(
                project=project,
                workspace=workspace,
                state=default_state,
                name=f"Recurring source {i}",
                recurrence_pattern="daily",
                recurrence_next_run_at=current_time,
            )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay") as mock_delay:
            summary = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert summary["created"] == 3
        assert mock_delay.call_count == 3


# ---------------------------------------------------------------------------
# Concurrency / idempotency
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIssueRecurrenceConcurrency:
    @pytest.mark.django_db(transaction=True)
    def test_two_concurrent_workers_do_not_double_create(self):
        """When two batch calls execute simultaneously, select_for_update(skip_locked)
        should ensure each source issue is processed exactly once in total."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        # Create enough sources that the two workers can each grab at least one,
        # but no source should be grabbed by both workers simultaneously.
        for i in range(4):
            _create_issue(
                project=project,
                workspace=workspace,
                state=default_state,
                name=f"Concurrent source {i}",
                recurrence_pattern="daily",
                recurrence_next_run_at=current_time,
            )

        summaries = []
        errors = []

        def run_batch():
            try:
                with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
                    result = _process_recurrence_batch(batch_size=10, current_time=current_time)
                summaries.append(result)
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        t1 = threading.Thread(target=run_batch)
        t2 = threading.Thread(target=run_batch)
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

        assert not errors, f"Worker threads raised exceptions: {errors}"

        total_created = sum(s["created"] for s in summaries)
        total_duplicates = Issue.objects.filter(
            recurrence_source_issue__isnull=False,
            recurrence_source_issue__project=project,
        ).count()

        # Each source issue should be processed exactly once across both workers
        assert total_created == 4
        assert total_duplicates == 4

    @pytest.mark.django_db
    def test_second_batch_at_same_timestamp_creates_nothing_new(self):
        """After one successful batch run, a second run at the exact same
        current_time should find zero due sources (next_run_at was advanced)."""
        workspace, project, default_state, _ = _create_project_context()
        current_time = datetime(2026, 3, 17, tzinfo=datetime_timezone.utc)

        _create_issue(
            project=project,
            workspace=workspace,
            state=default_state,
            name="Recurring source",
            recurrence_pattern="weekly",
            recurrence_next_run_at=current_time,
        )

        with patch("plane.bgtasks.issue_recurrence_task.issue_activity.delay"):
            first = _process_recurrence_batch(batch_size=10, current_time=current_time)
            second = _process_recurrence_batch(batch_size=10, current_time=current_time)

        assert first["created"] == 1
        assert second["scanned"] == 0
        assert second["created"] == 0
