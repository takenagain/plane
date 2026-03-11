# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from datetime import date, timedelta
from django.test import Client
from django.utils import timezone

from plane.tests.factories import (
    ProjectFactory,
    ProjectMemberFactory,
    UserFactory,
    WorkspaceFactory,
    WorkspaceMemberFactory,
)
from plane.db.models import Issue, Worklog


@pytest.mark.django_db
def test_time_logged_export_endpoint_returns_csv():
    # setup minimal workspace/project/issue with a worklog
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="ExportTest")
    Issue.issue_objects.create(project=proj, workspace=ws, name="NoWorklogIssue")

    Worklog.objects.create(issue=issue, actor=None, duration=90, logged_at=date.today())

    client = Client()
    # log in as workspace owner for permissions
    client.force_login(ws.owner)

    url = f"/api/workspaces/{ws.slug}/analytics/time-logged-export/"
    response = client.get(url)
    assert response.status_code == 200
    text = response.content.decode("utf-8")
    lines = [line for line in text.splitlines() if line.strip()]
    assert lines, "CSV response should not be empty"
    header = lines[0]
    # expect header columns
    assert "issue_id" in header
    assert "title" in header
    assert "hours_logged" in header
    assert "status" in header
    assert "priority" in header
    assert "assignee" in header
    # ensure that the exported duration matches expected hours (1.5h)
    assert any("1.50" in line for line in lines[1:]), "Expected 1.50 hours_logged in at least one data row"
    # ensure issues with zero hours are excluded
    assert all("NoWorklogIssue" not in line for line in lines[1:])


@pytest.mark.django_db
def test_time_logged_export_endpoint_includes_active_tracking_time():
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Active timer issue")

    worklog = Worklog.objects.create(issue=issue, actor=ws.owner, duration=0, logged_at=date.today())
    Worklog.objects.filter(pk=worklog.pk).update(created_at=timezone.now() - timedelta(minutes=90))

    client = Client()
    client.force_login(ws.owner)

    response = client.get(f"/api/workspaces/{ws.slug}/analytics/time-logged-export/")

    assert response.status_code == 200
    lines = [line for line in response.content.decode("utf-8").splitlines() if line.strip()]
    assert any("1.50" in line for line in lines[1:])


@pytest.mark.django_db
def test_project_time_logged_export_endpoint_denies_workspace_guest_without_project_membership():
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    outsider = UserFactory()
    WorkspaceMemberFactory(workspace=ws, member=outsider, role=5)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Restricted export issue")
    Worklog.objects.create(issue=issue, actor=ws.owner, duration=60, logged_at=date.today())

    client = Client()
    client.force_login(outsider)

    response = client.get(f"/api/workspaces/{ws.slug}/projects/{proj.id}/analytics/time-logged-export/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_project_time_logged_export_endpoint_allows_project_member():
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    member = UserFactory()
    WorkspaceMemberFactory(workspace=ws, member=member, role=15)
    ProjectMemberFactory(project=proj, member=member, role=15)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Project export issue")
    Worklog.objects.create(issue=issue, actor=ws.owner, duration=60, logged_at=date.today())

    client = Client()
    client.force_login(member)

    response = client.get(f"/api/workspaces/{ws.slug}/projects/{proj.id}/analytics/time-logged-export/")

    assert response.status_code == 200
