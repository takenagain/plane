from datetime import (
    date,
    datetime,
    timezone as datetime_timezone,
)

import pytest
from django.test import override_settings

from plane.app.serializers.issue import IssueCreateSerializer
from plane.db.models import Issue, Project, State, StateGroup
from plane.tests.factories import ProjectFactory, WorkspaceFactory


def _create_project_with_default_state():
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
    Project.objects.filter(pk=project.pk).update(default_state=default_state)
    project.refresh_from_db()
    return workspace, project, default_state


@pytest.mark.unit
class TestIssueRecurrenceSerializerValidation:
    """Tests covering recurrence field validation in IssueCreateSerializer."""

    @pytest.mark.django_db
    def test_validate_requires_due_date_for_repeat(self):
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={"name": "Recurring issue", "recurrence_pattern": "daily"},
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert not serializer.is_valid()
        assert serializer.errors["recurrence_pattern"] == ["Repeat requires a due date."]

    @pytest.mark.django_db
    def test_validate_requires_positive_max_repetitions(self):
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Recurring issue",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "weekly",
                "recurrence_max_occurrences": 0,
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert not serializer.is_valid()
        assert serializer.errors["recurrence_max_occurrences"] == ["Ensure this value is greater than or equal to 1."]

    @pytest.mark.django_db
    @override_settings(DEBUG=False)
    def test_validate_rejects_test_only_patterns_when_debug_is_disabled(self):
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Recurring issue",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "every_minute",
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert not serializer.is_valid()
        assert serializer.errors["recurrence_pattern"] == ["Repeat option is not available in this environment."]

    @pytest.mark.django_db
    @override_settings(DEBUG=True)
    def test_validate_allows_every_minute_pattern_when_debug_is_enabled(self):
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Recurring issue",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "every_minute",
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    @override_settings(DEBUG=True)
    def test_validate_allows_once_pattern_when_debug_is_enabled(self):
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Recurring issue",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "once",
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_validate_allows_null_recurrence_pattern(self):
        """Clearing recurrence_pattern to None should be valid."""
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Non-recurring issue",
                "recurrence_pattern": None,
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_validate_allows_max_repetitions_of_one(self):
        """Boundary value: max_occurrences=1 should be accepted."""
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Run once",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "daily",
                "recurrence_max_occurrences": 1,
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_validate_allows_null_max_repetitions(self):
        """Null max_occurrences means infinite recurrence — should be valid."""
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Infinite recurrence",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "weekly",
                "recurrence_max_occurrences": None,
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_validate_rejects_unknown_recurrence_pattern(self):
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "Bad pattern",
                "target_date": date(2026, 3, 20),
                "recurrence_pattern": "hourly",
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert not serializer.is_valid()
        assert "recurrence_pattern" in serializer.errors


@pytest.mark.unit
class TestIssueRecurrenceSerializerNextRunRecompute:
    """Tests that next_run_at is (re)computed at the right moments."""

    @pytest.mark.django_db
    def test_partial_update_does_not_recompute_next_run_when_recurrence_fields_are_unchanged(self):
        workspace, project, state = _create_project_with_default_state()
        issue = Issue.issue_objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Recurring issue",
            target_date=date(2026, 3, 20),
            recurrence_pattern="weekly",
            recurrence_next_run_at=datetime(2026, 3, 27, tzinfo=datetime_timezone.utc),
        )

        serializer = IssueCreateSerializer(
            instance=issue,
            data={"name": "Renamed recurring issue"},
            partial=True,
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors
        assert "recurrence_next_run_at" not in serializer.validated_data

    @pytest.mark.django_db
    def test_partial_update_recomputes_next_run_when_target_date_changes(self):
        workspace, project, state = _create_project_with_default_state()
        issue = Issue.issue_objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Recurring issue",
            target_date=date(2026, 3, 20),
            recurrence_pattern="weekly",
            recurrence_next_run_at=datetime(2026, 3, 27, tzinfo=datetime_timezone.utc),
        )

        serializer = IssueCreateSerializer(
            instance=issue,
            data={"target_date": date(2026, 4, 1)},
            partial=True,
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors
        assert "recurrence_next_run_at" in serializer.validated_data

    @pytest.mark.django_db
    def test_partial_update_recomputes_next_run_when_pattern_changes(self):
        workspace, project, state = _create_project_with_default_state()
        issue = Issue.issue_objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Recurring issue",
            target_date=date(2026, 3, 20),
            recurrence_pattern="weekly",
            recurrence_next_run_at=datetime(2026, 3, 27, tzinfo=datetime_timezone.utc),
        )

        serializer = IssueCreateSerializer(
            instance=issue,
            data={"recurrence_pattern": "monthly"},
            partial=True,
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors
        assert "recurrence_next_run_at" in serializer.validated_data

    @pytest.mark.django_db
    def test_partial_update_recomputes_next_run_when_max_occurrences_changes(self):
        workspace, project, state = _create_project_with_default_state()
        issue = Issue.issue_objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Recurring issue",
            target_date=date(2026, 3, 20),
            recurrence_pattern="weekly",
            recurrence_next_run_at=datetime(2026, 3, 27, tzinfo=datetime_timezone.utc),
        )

        serializer = IssueCreateSerializer(
            instance=issue,
            data={"recurrence_max_occurrences": 5},
            partial=True,
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors
        assert "recurrence_next_run_at" in serializer.validated_data

    @pytest.mark.django_db
    def test_clearing_recurrence_pattern_nulls_out_next_run(self):
        """Setting recurrence_pattern to None on an existing recurring issue
        should cause recurrence_next_run_at to be computed as None."""
        workspace, project, state = _create_project_with_default_state()
        issue = Issue.issue_objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Recurring issue",
            target_date=date(2026, 3, 20),
            recurrence_pattern="weekly",
            recurrence_next_run_at=datetime(2026, 3, 27, tzinfo=datetime_timezone.utc),
        )

        serializer = IssueCreateSerializer(
            instance=issue,
            data={"recurrence_pattern": None},
            partial=True,
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors
        # recurrence_next_run_at should be recomputed to None since pattern is cleared
        assert serializer.validated_data.get("recurrence_next_run_at") is None

    @pytest.mark.django_db
    def test_create_with_recurrence_populates_next_run_at(self):
        """Creating an issue with a recurrence pattern should produce a
        non-null recurrence_next_run_at in validated_data."""
        workspace, project, _ = _create_project_with_default_state()
        serializer = IssueCreateSerializer(
            data={
                "name": "New recurring issue",
                "target_date": date(2026, 6, 1),
                "recurrence_pattern": "daily",
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )

        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data.get("recurrence_next_run_at") is not None
