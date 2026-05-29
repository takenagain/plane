from unittest.mock import patch

import pytest

from plane.db.models import Issue, SentryIssueLink, SentryProjectMapping, SentryWorkspaceConnection, State
from plane.integrations.sentry.sync import sync_plane_state_to_sentry
from plane.license.utils.encryption import encrypt_data
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory, WorkspaceMemberFactory


pytestmark = pytest.mark.unit


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
    return ProjectFactory(workspace=workspace, created_by=user, updated_by=user)


@pytest.fixture
def sentry_issue_link(workspace, project, user):
    unresolved = State.objects.create(
        name="Todo",
        group="unstarted",
        project=project,
        workspace=workspace,
        created_by=user,
        updated_by=user,
    )
    resolved = State.objects.create(
        name="Done",
        group="completed",
        project=project,
        workspace=workspace,
        created_by=user,
        updated_by=user,
    )
    SentryWorkspaceConnection.objects.create(
        workspace=workspace,
        sentry_org_slug="test-org",
        access_token_encrypted=encrypt_data("token"),
    )
    mapping = SentryProjectMapping.objects.create(
        workspace=workspace,
        project=project,
        sentry_project_slug="backend",
        unresolved_state=unresolved,
        resolved_state=resolved,
    )
    issue = Issue.objects.create(
        workspace=workspace,
        project=project,
        name="[Sentry] Test",
        state=unresolved,
        description_html="<p></p>",
    )
    SentryIssueLink.objects.create(
        workspace=workspace,
        project=project,
        issue=issue,
        sentry_issue_id="555",
        sentry_project_slug="backend",
        mapping=mapping,
    )
    return issue, mapping


@patch("plane.integrations.sentry.sync.requests.put")
def test_sync_plane_state_to_sentry_resolved(mock_put, sentry_issue_link):
    issue, mapping = sentry_issue_link
    issue.state_id = mapping.resolved_state_id
    issue.save(update_fields=["state_id"])

    sync_plane_state_to_sentry(issue)

    mock_put.assert_called_once()
    assert mock_put.call_args.kwargs["json"] == {"status": "resolved"}
