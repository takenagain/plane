# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from datetime import date
from django.test import Client

from plane.tests.factories import WorkspaceFactory, ProjectFactory
from plane.db.models import Issue, Worklog


@pytest.mark.django_db
def test_time_logged_export_endpoint_returns_csv():
    # setup minimal workspace/project/issue with a worklog
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="ExportTest")

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
