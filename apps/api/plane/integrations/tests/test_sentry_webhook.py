import hashlib
import hmac
import json

import pytest

from plane.db.models import Issue, SentryIssueLink, SentryProjectMapping, SentryWorkspaceConnection, State
from plane.integrations.sentry.webhooks import process_sentry_webhook, verify_sentry_signature
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory, WorkspaceMemberFactory


pytestmark = pytest.mark.unit


def _sign(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


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
def sentry_setup(workspace, project, user):
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
    connection = SentryWorkspaceConnection.objects.create(
        workspace=workspace,
        sentry_org_slug="test-org",
        webhook_secret="test-webhook-secret",
    )
    mapping = SentryProjectMapping.objects.create(
        workspace=workspace,
        project=project,
        sentry_project_slug="backend",
        unresolved_state=unresolved,
        resolved_state=resolved,
    )
    return connection, mapping


def test_verify_sentry_signature():
    body = b'{"action":"created"}'
    secret = "secret"
    signature = _sign(body, secret)
    assert verify_sentry_signature(body=body, signature_header=signature, secret=secret)
    assert not verify_sentry_signature(body=body, signature_header=signature, secret="wrong")


def test_alert_webhook_creates_issue(sentry_setup, workspace):
    connection, mapping = sentry_setup
    payload = {
        "action": "triggered",
        "data": {
            "issue": {
                "id": "12345",
                "title": "NullPointer in worker",
                "permalink": "https://sentry.io/issues/12345/",
                "project": {"slug": "backend"},
                "level": "error",
            }
        },
    }
    body = json.dumps(payload).encode()
    result = process_sentry_webhook(
        workspace_slug=workspace.slug,
        body=body,
        payload=payload,
        signature=_sign(body, connection.webhook_secret),
    )
    assert "issue_id" in result
    issue = Issue.objects.get(id=result["issue_id"])
    assert issue.name.startswith("[Sentry]")
    assert issue.external_source == "sentry"
    assert issue.external_id == "12345"
    assert SentryIssueLink.objects.filter(sentry_issue_id="12345", mapping=mapping).exists()


def test_resolved_webhook_updates_state(sentry_setup, workspace):
    connection, mapping = sentry_setup
    create_payload = {
        "action": "triggered",
        "data": {
            "issue": {
                "id": "999",
                "title": "Error",
                "project": {"slug": "backend"},
            }
        },
    }
    body = json.dumps(create_payload).encode()
    process_sentry_webhook(
        workspace_slug=workspace.slug,
        body=body,
        payload=create_payload,
        signature=_sign(body, connection.webhook_secret),
    )

    resolved_payload = {
        "action": "resolved",
        "data": {
            "issue": {
                "id": "999",
                "title": "Error",
                "status": "resolved",
                "project": {"slug": "backend"},
            }
        },
    }
    body = json.dumps(resolved_payload).encode()
    result = process_sentry_webhook(
        workspace_slug=workspace.slug,
        body=body,
        payload=resolved_payload,
        signature=_sign(body, connection.webhook_secret),
    )
    issue = Issue.objects.get(id=result["issue_id"])
    assert issue.state_id == mapping.resolved_state_id
