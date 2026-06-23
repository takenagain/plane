# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


import pytest

from plane.agent.tools.analytics import get_project_analytics, get_workspace_project_stats
from plane.agent.tools.intake import create_intake_issue, list_intake_issues, update_intake_issue
from plane.agent.tools.relations import create_issue_relation, list_issue_relations, remove_issue_relation
from plane.agent.tools.registry import TOOL_REGISTRY, get_tool_definitions
from plane.agent.tools.views import get_view, list_views
from plane.agent.tools.worklogs import create_worklog, delete_worklog, list_worklogs, update_worklog
from plane.db.models import Issue, IssueRelation, IssueView, Project, ProjectMember, State, StateGroup
from plane.db.models.project import ROLE


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Test Project",
        identifier="TEST",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=ROLE.ADMIN.value,
        is_active=True,
    )
    return project


@pytest.fixture
def backlog_state(db, workspace, project):
    return State.objects.create(
        name="Backlog",
        group=StateGroup.BACKLOG.value,
        project=project,
        workspace=workspace,
        color="#000000",
        sequence=1000,
        default=True,
    )


@pytest.fixture
def issue(db, workspace, project, backlog_state, create_user):
    return Issue.objects.create(
        name="Test Issue",
        project=project,
        workspace=workspace,
        state=backlog_state,
        created_by=create_user,
    )


@pytest.mark.unit
@pytest.mark.django_db
class TestAnalyticsTools:
    def test_get_project_analytics(self, create_user, workspace, project, issue):
        result = get_project_analytics(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
        )
        assert result["project_id"] == str(project.id)
        assert result["work_items"]["total"] == 1
        assert result["work_items"]["backlog"] == 1

    def test_get_workspace_project_stats(self, create_user, workspace, project, issue):
        result = get_workspace_project_stats(
            request_user=create_user,
            workspace_slug=workspace.slug,
        )
        assert result["count"] == 1
        assert result["projects"][0]["identifier"] == "TEST"


@pytest.mark.unit
@pytest.mark.django_db
class TestIntakeTools:
    def test_create_and_list_intake_issue(self, create_user, workspace, project):
        created = create_intake_issue(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="Incoming request",
        )
        assert created["created"] is True
        assert created["intake_issue"]["name"] == "Incoming request"

        listing = list_intake_issues(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
        )
        assert listing["count"] == 1
        assert listing["intake_issues"][0]["status"] == "pending"

    def test_update_intake_issue_status(self, create_user, workspace, project):
        created = create_intake_issue(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="To accept",
        )
        issue_id = created["intake_issue"]["issue_id"]
        updated = update_intake_issue(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            issue_id=issue_id,
            status="accepted",
        )
        assert updated["intake_issue"]["status"] == "accepted"


@pytest.mark.unit
@pytest.mark.django_db
class TestRelationTools:
    def test_create_list_and_remove_relation(self, create_user, workspace, project, backlog_state):
        issue_a = Issue.objects.create(name="Issue A", project=project, workspace=workspace, state=backlog_state)
        issue_b = Issue.objects.create(name="Issue B", project=project, workspace=workspace, state=backlog_state)

        created = create_issue_relation(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue_a.id),
            relation_type="relates_to",
            related_issue_ids=[str(issue_b.id)],
        )
        assert created["created"] is True
        assert IssueRelation.objects.filter(issue_id=issue_a.id, related_issue_id=issue_b.id).exists()

        listing = list_issue_relations(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue_a.id),
        )
        assert "relates_to" in listing["relations"]
        assert len(listing["relations"]["relates_to"]) == 1

        removed = remove_issue_relation(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue_a.id),
            related_issue_id=str(issue_b.id),
        )
        assert removed["removed"] is True
        assert not IssueRelation.objects.filter(issue_id=issue_a.id, related_issue_id=issue_b.id).exists()

    def test_blocked_by_relation_labels_match_api(self, create_user, workspace, project, backlog_state):
        issue_a = Issue.objects.create(name="Issue A", project=project, workspace=workspace, state=backlog_state)
        issue_b = Issue.objects.create(name="Issue B", project=project, workspace=workspace, state=backlog_state)

        create_issue_relation(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue_a.id),
            relation_type="blocked_by",
            related_issue_ids=[str(issue_b.id)],
        )

        listing_a = list_issue_relations(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue_a.id),
        )
        assert listing_a["relations"]["blocked_by"][0]["id"] == str(issue_b.id)

        listing_b = list_issue_relations(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue_b.id),
        )
        assert listing_b["relations"]["blocking"][0]["id"] == str(issue_a.id)


@pytest.mark.unit
@pytest.mark.django_db
class TestWorklogTools:
    def test_create_list_update_delete_worklog(self, create_user, workspace, issue):
        created = create_worklog(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            duration=60,
            logged_at="2026-06-01",
            description="Implemented feature",
        )
        worklog_id = created["worklog"]["id"]

        listing = list_worklogs(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
        )
        assert listing["count"] == 1
        assert listing["total_duration"] == 60

        updated = update_worklog(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            worklog_id=worklog_id,
            duration=90,
        )
        assert updated["worklog"]["duration"] == 90

        deleted = delete_worklog(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            worklog_id=worklog_id,
        )
        assert deleted["deleted"] is True

    def test_update_worklog_rejects_zero_duration(self, create_user, workspace, issue):
        created = create_worklog(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            duration=60,
            logged_at="2026-06-01",
        )
        with pytest.raises(ValueError, match="Duration must be at least 1 minute"):
            update_worklog(
                request_user=create_user,
                workspace_slug=workspace.slug,
                issue_id=str(issue.id),
                worklog_id=created["worklog"]["id"],
                duration=0,
            )


@pytest.mark.unit
@pytest.mark.django_db
class TestViewTools:
    def test_list_and_get_view(self, create_user, workspace, project):
        view = IssueView.objects.create(
            name="High priority",
            workspace=workspace,
            project=project,
            owned_by=create_user,
            filters={"priority": ["high"]},
        )
        listing = list_views(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
        )
        assert listing["count"] == 1

        detail = get_view(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            view_id=str(view.id),
        )
        assert detail["name"] == "High priority"
        assert detail["filters"]["priority"] == ["high"]


@pytest.mark.unit
class TestExtendedToolRegistry:
    def test_extended_tools_registered(self):
        expected = {
            "get_project_analytics",
            "get_workspace_project_stats",
            "list_intake_issues",
            "create_intake_issue",
            "update_intake_issue",
            "list_issue_relations",
            "create_issue_relation",
            "remove_issue_relation",
            "list_worklogs",
            "create_worklog",
            "update_worklog",
            "delete_worklog",
            "list_views",
            "get_view",
        }
        assert expected.issubset(set(TOOL_REGISTRY.keys()))
        tool_names = {definition["function"]["name"] for definition in get_tool_definitions()}
        assert expected.issubset(tool_names)
