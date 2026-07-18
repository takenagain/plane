
import pytest

from plane.agent.tools.registry import TOOL_REGISTRY, get_tool_definitions
from plane.agent.tools.work_items import (
    BULK_UPDATE_MAX_ISSUE_IDS,
    bulk_update_work_items,
    create_work_item,
    get_work_item,
    list_work_items,
    update_work_item,
)
from plane.db.models import Issue, IssueAssignee, IssueLabel, Label, Project, ProjectMember, State, StateGroup
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
def done_state(db, workspace, project):
    return State.objects.create(
        name="Done",
        group=StateGroup.COMPLETED.value,
        project=project,
        workspace=workspace,
        color="#00ff00",
        sequence=2000,
    )


@pytest.fixture
def label(db, workspace, project, create_user):
    return Label.objects.create(
        name="Bug",
        color="#ff0000",
        workspace=workspace,
        project=project,
        created_by=create_user,
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


@pytest.fixture
def second_member(db, workspace, project, create_user):
    from plane.db.models import User

    user = User.objects.create(
        email="member@plane.so",
        username="member@plane.so",
        first_name="Member",
        last_name="User",
    )
    ProjectMember.objects.create(
        project=project,
        member=user,
        role=ROLE.MEMBER.value,
        is_active=True,
    )
    return user


@pytest.fixture
def guest_user(db, workspace, project):
    from plane.db.models import User

    user = User.objects.create(
        email="guest@plane.so",
        username="guest@plane.so",
        first_name="Guest",
        last_name="User",
    )
    ProjectMember.objects.create(
        project=project,
        member=user,
        role=ROLE.GUEST.value,
        is_active=True,
    )
    return user


@pytest.fixture
def outsider_user(db):
    from plane.db.models import User

    return User.objects.create(
        email="outsider@plane.so",
        username="outsider@plane.so",
        first_name="Outsider",
        last_name="User",
    )


@pytest.fixture
def second_project(db, workspace, create_user):
    project = Project.objects.create(
        name="Other Project",
        identifier="OTHER",
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
def other_project_state(db, workspace, second_project):
    return State.objects.create(
        name="Other Backlog",
        group=StateGroup.BACKLOG.value,
        project=second_project,
        workspace=workspace,
        color="#000000",
        sequence=1000,
        default=True,
    )


@pytest.fixture
def other_project_label(db, workspace, second_project, create_user):
    return Label.objects.create(
        name="Other Label",
        color="#00ff00",
        workspace=workspace,
        project=second_project,
        created_by=create_user,
    )


@pytest.mark.unit
@pytest.mark.django_db
class TestWorkItemToolSchemas:
    def test_create_and_update_schemas_expose_mutable_fields(self):
        tool_names = {definition["function"]["name"]: definition for definition in get_tool_definitions()}
        create_props = tool_names["create_work_item"]["function"]["parameters"]["properties"]
        update_props = tool_names["update_work_item"]["function"]["parameters"]["properties"]
        bulk_props = tool_names["bulk_update_work_items"]["function"]["parameters"]["properties"]

        expected = {
            "name",
            "description",
            "priority",
            "state_id",
            "assignee_ids",
            "label_ids",
            "start_date",
            "target_date",
            "estimate_point_id",
            "type_id",
        }
        assert expected.issubset(create_props.keys())
        assert expected.issubset(update_props.keys())
        assert expected.issubset(bulk_props.keys())
        assert "parent_id" in create_props
        assert "parent_id" in update_props
        assert "issue_ids" in bulk_props

    def test_bulk_update_registered(self):
        assert "bulk_update_work_items" in TOOL_REGISTRY


@pytest.mark.unit
@pytest.mark.django_db
class TestUpdateWorkItem:
    def test_update_assignees_and_fields(
        self,
        create_user,
        workspace,
        project,
        issue,
        done_state,
        label,
        second_member,
    ):
        result = update_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            name="Updated title",
            priority="high",
            state_id=str(done_state.id),
            assignee_ids=[str(create_user.id), str(second_member.id)],
            label_ids=[str(label.id)],
            start_date="2026-07-01",
            target_date="2026-07-15",
        )
        assert result["updated"] is True

        detail = get_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
        )
        assert detail["name"] == "Updated title"
        assert detail["priority"] == "high"
        assert detail["state_id"] == str(done_state.id)
        assert set(detail["assignees"]) == {str(create_user.id), str(second_member.id)}
        assert detail["labels"] == [str(label.id)]
        assert detail["start_date"] == "2026-07-01"
        assert detail["target_date"] == "2026-07-15"
        assert IssueAssignee.objects.filter(issue=issue).count() == 2
        assert IssueLabel.objects.filter(issue=issue).count() == 1

    def test_update_assignees_replaces_existing(self, create_user, workspace, project, issue, second_member):
        IssueAssignee.objects.create(
            issue=issue,
            assignee=create_user,
            workspace=issue.workspace,
            project=issue.project,
        )

        update_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            assignee_ids=[str(second_member.id)],
        )

        detail = get_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
        )
        assert detail["assignees"] == [str(second_member.id)]

    def test_update_filters_non_project_assignees(
        self, create_user, workspace, project, issue, second_member, outsider_user, guest_user
    ):
        update_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            assignee_ids=[str(second_member.id), str(outsider_user.id), str(guest_user.id)],
        )

        detail = get_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
        )
        assert detail["assignees"] == [str(second_member.id)]

    def test_update_rejects_cross_project_state(
        self, create_user, workspace, project, issue, other_project_state
    ):
        with pytest.raises(ValueError, match="State is not valid"):
            update_work_item(
                request_user=create_user,
                workspace_slug=workspace.slug,
                issue_id=str(issue.id),
                state_id=str(other_project_state.id),
            )

    def test_update_filters_labels_to_project(
        self, create_user, workspace, project, issue, label, other_project_label
    ):
        update_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
            label_ids=[str(label.id), str(other_project_label.id)],
        )

        detail = get_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=str(issue.id),
        )
        assert detail["labels"] == [str(label.id)]


@pytest.mark.unit
@pytest.mark.django_db
class TestCreateWorkItem:
    def test_create_with_assignees_labels_and_dates(
        self,
        create_user,
        workspace,
        project,
        backlog_state,
        label,
        second_member,
    ):
        created = create_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="New issue",
            description="<p>Details</p>",
            priority="urgent",
            state_id=str(backlog_state.id),
            assignee_ids=[str(second_member.id)],
            label_ids=[str(label.id)],
            start_date="2026-08-01",
            target_date="2026-08-10",
        )
        assert created["created"] is True

        detail = get_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=created["id"],
        )
        assert detail["name"] == "New issue"
        assert detail["priority"] == "urgent"
        assert detail["assignees"] == [str(second_member.id)]
        assert detail["labels"] == [str(label.id)]
        assert detail["start_date"] == "2026-08-01"
        assert detail["target_date"] == "2026-08-10"

    def test_create_filters_non_project_assignees(
        self, create_user, workspace, project, backlog_state, second_member, outsider_user
    ):
        created = create_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="Filtered assignees",
            assignee_ids=[str(second_member.id), str(outsider_user.id)],
        )

        detail = get_work_item(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_id=created["id"],
        )
        assert detail["assignees"] == [str(second_member.id)]

    def test_create_rejects_cross_project_state(
        self, create_user, workspace, project, other_project_state
    ):
        with pytest.raises(ValueError, match="State is not valid"):
            create_work_item(
                request_user=create_user,
                workspace_slug=workspace.slug,
                project_id=str(project.id),
                name="Bad state",
                state_id=str(other_project_state.id),
            )


@pytest.mark.unit
@pytest.mark.django_db
class TestBulkUpdateWorkItems:
    def test_bulk_update_priority_and_state(
        self,
        create_user,
        workspace,
        project,
        backlog_state,
        done_state,
    ):
        issue_a = Issue.objects.create(
            name="Issue A",
            project=project,
            workspace=workspace,
            state=backlog_state,
            created_by=create_user,
        )
        issue_b = Issue.objects.create(
            name="Issue B",
            project=project,
            workspace=workspace,
            state=backlog_state,
            created_by=create_user,
        )

        result = bulk_update_work_items(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_ids=[str(issue_a.id), str(issue_b.id)],
            priority="medium",
            state_id=str(done_state.id),
        )
        assert result["updated_count"] == 2
        assert set(result["updated_ids"]) == {str(issue_a.id), str(issue_b.id)}
        assert result["errors"] == []

        for issue_id in (issue_a.id, issue_b.id):
            detail = get_work_item(
                request_user=create_user,
                workspace_slug=workspace.slug,
                issue_id=str(issue_id),
            )
            assert detail["priority"] == "medium"
            assert detail["state_id"] == str(done_state.id)

    def test_bulk_update_collects_errors(self, create_user, workspace, project, issue):
        result = bulk_update_work_items(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_ids=[str(issue.id), "00000000-0000-0000-0000-000000000000"],
            priority="low",
        )
        assert result["updated_count"] == 1
        assert result["updated_ids"] == [str(issue.id)]
        assert len(result["errors"]) == 1
        assert result["errors"][0]["issue_id"] == "00000000-0000-0000-0000-000000000000"

    def test_bulk_update_rejects_oversized_issue_ids(self, create_user, workspace, project, issue):
        oversized = [str(issue.id)] * (BULK_UPDATE_MAX_ISSUE_IDS + 1)
        with pytest.raises(ValueError, match="cannot exceed"):
            bulk_update_work_items(
                request_user=create_user,
                workspace_slug=workspace.slug,
                issue_ids=oversized,
                priority="low",
            )

    def test_bulk_update_continues_on_cross_project_state_error(
        self, create_user, workspace, project, issue, backlog_state, other_project_state
    ):
        issue_b = Issue.objects.create(
            name="Issue B",
            project=project,
            workspace=workspace,
            state=backlog_state,
            created_by=create_user,
        )

        result = bulk_update_work_items(
            request_user=create_user,
            workspace_slug=workspace.slug,
            issue_ids=[str(issue.id), str(issue_b.id)],
            state_id=str(other_project_state.id),
        )
        assert result["updated_count"] == 0
        assert len(result["errors"]) == 2


@pytest.mark.unit
@pytest.mark.django_db
class TestListWorkItems:
    def test_list_includes_enriched_fields(
        self,
        create_user,
        workspace,
        project,
        issue,
        label,
        second_member,
    ):
        IssueAssignee.objects.create(
            issue=issue,
            assignee=second_member,
            workspace=issue.workspace,
            project=issue.project,
        )
        IssueLabel.objects.create(
            issue=issue,
            label=label,
            workspace=issue.workspace,
            project=issue.project,
        )
        issue.start_date = "2026-07-01"
        issue.target_date = "2026-07-15"
        issue.save(update_fields=["start_date", "target_date"])

        listing = list_work_items(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
        )
        assert listing["count"] == 1
        item = listing["issues"][0]
        assert item["assignees"] == [str(second_member.id)]
        assert item["label_ids"] == [str(label.id)]
        assert item["start_date"] == "2026-07-01"
        assert item["target_date"] == "2026-07-15"
