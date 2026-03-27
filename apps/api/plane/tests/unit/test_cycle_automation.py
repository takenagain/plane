# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.utils import timezone

from plane.bgtasks.cycle_automation_task import (
    create_upcoming_cycles,
    get_fallback_user_id,
    has_overlapping_cycle,
    next_sprint_name,
    process_cycle_automations,
    transfer_incomplete_issues,
)
from plane.db.models import Cycle, CycleIssue, Issue, Project, State
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory, WorkspaceMemberFactory


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def workspace(user):
    ws = WorkspaceFactory(owner=user)
    WorkspaceMemberFactory(workspace=ws, member=user)
    return ws


@pytest.fixture
def project(workspace, user):
    proj = ProjectFactory(
        workspace=workspace,
        created_by=user,
        updated_by=user,
        auto_create_cycles=True,
        auto_transfer_cycle_issues=False,
    )
    # BaseModel.save nullifies created_by when no request user context exists.
    # Patch it back for background-task tests that rely on project.created_by_id.
    Project.objects.filter(id=proj.id).update(created_by=user)
    proj.refresh_from_db()
    return proj


@pytest.fixture
def states(project, user):
    """Create a set of states for the project."""
    backlog = State.objects.create(
        name="Backlog",
        group="backlog",
        project=project,
        workspace=project.workspace,
        created_by=user,
        updated_by=user,
    )
    started = State.objects.create(
        name="In Progress",
        group="started",
        project=project,
        workspace=project.workspace,
        created_by=user,
        updated_by=user,
    )
    completed = State.objects.create(
        name="Done",
        group="completed",
        project=project,
        workspace=project.workspace,
        created_by=user,
        updated_by=user,
    )
    cancelled = State.objects.create(
        name="Cancelled",
        group="cancelled",
        project=project,
        workspace=project.workspace,
        created_by=user,
        updated_by=user,
    )
    return {"backlog": backlog, "started": started, "completed": completed, "cancelled": cancelled}


@pytest.fixture
def ended_cycle(project, user):
    """A cycle that ended within the last 24 hours."""
    now = timezone.now()
    return Cycle.objects.create(
        name="Sprint 1",
        project=project,
        workspace=project.workspace,
        start_date=now - timedelta(days=15),
        end_date=now - timedelta(hours=2),
        owned_by=user,
        created_by=user,
        updated_by=user,
    )


@pytest.mark.django_db
class TestNextSprintName:
    def test_first_sprint(self, project):
        # No existing sprints
        Cycle.objects.filter(project=project).delete()
        assert next_sprint_name(project.id) == "Sprint 1"

    def test_increments_from_existing(self, project, user):
        Cycle.objects.create(
            name="Sprint 3",
            project=project,
            workspace=project.workspace,
            owned_by=user,
            created_by=user,
            updated_by=user,
        )
        assert next_sprint_name(project.id) == "Sprint 4"

    def test_ignores_non_matching_names(self, project, user):
        Cycle.objects.create(
            name="My Custom Cycle",
            project=project,
            workspace=project.workspace,
            owned_by=user,
            created_by=user,
            updated_by=user,
        )
        assert next_sprint_name(project.id) == "Sprint 1"

    def test_finds_max_across_multiple(self, project, user):
        for i in [1, 5, 3]:
            Cycle.objects.create(
                name=f"Sprint {i}",
                project=project,
                workspace=project.workspace,
                owned_by=user,
                created_by=user,
                updated_by=user,
            )
        assert next_sprint_name(project.id) == "Sprint 6"


@pytest.mark.django_db
class TestHasOverlappingCycle:
    def test_no_overlap(self, project):
        now = timezone.now()
        assert not has_overlapping_cycle(project.id, now + timedelta(days=100), now + timedelta(days=113))

    def test_detects_overlap(self, project, ended_cycle):
        # ended_cycle spans from -15d to -2h — check an overlap with that range
        assert has_overlapping_cycle(project.id, ended_cycle.start_date, ended_cycle.end_date)


@pytest.mark.django_db
class TestCreateUpcomingCycles:
    def test_creates_two_cycles(self, project, ended_cycle):
        created = create_upcoming_cycles(project, ended_cycle)
        assert len(created) == 2

        cycles = Cycle.objects.filter(id__in=created).order_by("start_date")
        first, second = cycles[0], cycles[1]

        # First cycle starts day after ended cycle
        expected_start = ended_cycle.end_date + timedelta(days=1)
        assert first.start_date.date() == expected_start.date()
        assert (first.end_date - first.start_date).days == 13  # 14-day span

        # Second cycle starts day after first ends
        assert second.start_date.date() == (first.end_date + timedelta(days=1)).date()
        assert (second.end_date - second.start_date).days == 13

    def test_idempotent_no_duplicates(self, project, ended_cycle):
        create_upcoming_cycles(project, ended_cycle)
        create_upcoming_cycles(project, ended_cycle)

        # Should still only have the original + 2 created cycles
        total = Cycle.objects.filter(project=project).count()
        assert total == 3  # ended_cycle + 2 new

    def test_skips_existing_overlapping(self, project, ended_cycle, user):
        # Create a cycle that overlaps with the first proposed range
        start = ended_cycle.end_date + timedelta(days=1)
        Cycle.objects.create(
            name="Existing Sprint",
            project=project,
            workspace=project.workspace,
            start_date=start,
            end_date=start + timedelta(days=13),
            owned_by=user,
            created_by=user,
            updated_by=user,
        )

        created = create_upcoming_cycles(project, ended_cycle)
        # Should only create 1 (the second range)
        assert len(created) == 1


@pytest.mark.django_db
class TestTransferIncompleteIssues:
    def test_transfers_incomplete_issues(self, project, ended_cycle, states, user):
        # Create next cycle
        next_start = ended_cycle.end_date + timedelta(days=1)
        next_cycle = Cycle.objects.create(
            name="Sprint 2",
            project=project,
            workspace=project.workspace,
            start_date=next_start,
            end_date=next_start + timedelta(days=13),
            owned_by=user,
            created_by=user,
            updated_by=user,
        )

        # Create issues in different states
        incomplete_issue = Issue.objects.create(
            name="Incomplete task",
            project=project,
            workspace=project.workspace,
            state=states["backlog"],
            created_by=user,
            updated_by=user,
        )
        completed_issue = Issue.objects.create(
            name="Done task",
            project=project,
            workspace=project.workspace,
            state=states["completed"],
            created_by=user,
            updated_by=user,
        )

        CycleIssue.objects.create(
            cycle=ended_cycle,
            issue=incomplete_issue,
            project=project,
            workspace=project.workspace,
            created_by=user,
            updated_by=user,
        )
        CycleIssue.objects.create(
            cycle=ended_cycle,
            issue=completed_issue,
            project=project,
            workspace=project.workspace,
            created_by=user,
            updated_by=user,
        )

        result = transfer_incomplete_issues(project, ended_cycle)
        assert result is True

        # Incomplete issue should now be in next cycle
        ci = CycleIssue.objects.get(issue=incomplete_issue)
        assert ci.cycle_id == next_cycle.id

        # Completed issue stays in ended cycle
        ci_done = CycleIssue.objects.get(issue=completed_issue)
        assert ci_done.cycle_id == ended_cycle.id

    def test_no_next_cycle_returns_false(self, project, ended_cycle):
        result = transfer_incomplete_issues(project, ended_cycle)
        assert result is False

    def test_no_incomplete_issues(self, project, ended_cycle, states, user):
        next_start = ended_cycle.end_date + timedelta(days=1)
        Cycle.objects.create(
            name="Sprint 2",
            project=project,
            workspace=project.workspace,
            start_date=next_start,
            end_date=next_start + timedelta(days=13),
            owned_by=user,
            created_by=user,
            updated_by=user,
        )

        # Only completed issues — nothing to transfer
        done_issue = Issue.objects.create(
            name="Done task",
            project=project,
            workspace=project.workspace,
            state=states["completed"],
            created_by=user,
            updated_by=user,
        )
        CycleIssue.objects.create(
            cycle=ended_cycle,
            issue=done_issue,
            project=project,
            workspace=project.workspace,
            created_by=user,
            updated_by=user,
        )

        result = transfer_incomplete_issues(project, ended_cycle)
        assert result is True


@pytest.mark.django_db
class TestProcessCycleAutomations:
    def test_creates_cycles_for_qualifying_project(self, project, ended_cycle):
        process_cycle_automations()

        # Should have created 2 new cycles (3 total)
        total = Cycle.objects.filter(project=project).count()
        assert total == 3

    def test_skips_archived_projects(self, project, ended_cycle):
        Project.objects.filter(id=project.id).update(archived_at=timezone.now())

        process_cycle_automations()

        # Only the ended cycle should exist
        total = Cycle.objects.filter(project=project).count()
        assert total == 1

    def test_skips_projects_without_auto_create(self, project, ended_cycle):
        Project.objects.filter(id=project.id).update(auto_create_cycles=False)

        process_cycle_automations()

        total = Cycle.objects.filter(project=project).count()
        assert total == 1

    def test_transfer_only_when_enabled(self, project, ended_cycle, states, user):
        Project.objects.filter(id=project.id).update(auto_transfer_cycle_issues=True)

        # Create an incomplete issue in the ended cycle
        issue = Issue.objects.create(
            name="Backlog task",
            project=project,
            workspace=project.workspace,
            state=states["backlog"],
            created_by=user,
            updated_by=user,
        )
        CycleIssue.objects.create(
            cycle=ended_cycle,
            issue=issue,
            project=project,
            workspace=project.workspace,
            created_by=user,
            updated_by=user,
        )

        process_cycle_automations()

        # Cycles created + issue should be transferred to first new cycle
        new_cycles = Cycle.objects.filter(project=project).exclude(id=ended_cycle.id).order_by("start_date")
        assert new_cycles.count() == 2

        ci = CycleIssue.objects.get(issue=issue)
        assert ci.cycle_id == new_cycles.first().id

    def test_no_transfer_when_disabled(self, project, ended_cycle, states, user):
        # auto_transfer_cycle_issues is False by default in fixture
        issue = Issue.objects.create(
            name="Backlog task",
            project=project,
            workspace=project.workspace,
            state=states["backlog"],
            created_by=user,
            updated_by=user,
        )
        CycleIssue.objects.create(
            cycle=ended_cycle,
            issue=issue,
            project=project,
            workspace=project.workspace,
            created_by=user,
            updated_by=user,
        )

        process_cycle_automations()

        # Issue should still be in the ended cycle
        ci = CycleIssue.objects.get(issue=issue)
        assert ci.cycle_id == ended_cycle.id


@pytest.mark.django_db
class TestGetFallbackUserId:
    def test_returns_created_by_when_set(self, project, user):
        assert get_fallback_user_id(project) == user.id

    def test_falls_back_to_workspace_admin(self, project):
        Project.objects.filter(id=project.id).update(created_by=None)
        project.refresh_from_db()
        # The workspace admin fixture user should be returned
        result = get_fallback_user_id(project)
        assert result is not None

    def test_returns_none_when_no_admin(self, user):
        ws = WorkspaceFactory(owner=user)
        proj = ProjectFactory(workspace=ws, created_by=user, updated_by=user)
        Project.objects.filter(id=proj.id).update(created_by=None)
        proj.refresh_from_db()
        # Remove all workspace members
        from plane.db.models import WorkspaceMember

        WorkspaceMember.objects.filter(workspace=ws).delete()
        assert get_fallback_user_id(proj) is None

    def test_create_cycles_skips_when_no_owner(self, ended_cycle, user):
        project = ended_cycle.project
        Project.objects.filter(id=project.id).update(created_by=None)
        project.refresh_from_db()
        from plane.db.models import WorkspaceMember

        WorkspaceMember.objects.filter(workspace=project.workspace).delete()
        created = create_upcoming_cycles(project, ended_cycle)
        assert created == []
