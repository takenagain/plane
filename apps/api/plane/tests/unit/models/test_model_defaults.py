# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Issue, Project, User, Worklog


@pytest.mark.django_db
def test_user_generates_username_from_email():
    user = User.objects.create(email="auto-user@plane.so")

    assert user.username == "auto-user@plane.so"


@pytest.mark.django_db
def test_project_generates_identifier_from_name(workspace):
    project = Project.objects.create(name="Generated Identifier", workspace=workspace)

    assert project.identifier == "GENERATEDIDE"


@pytest.mark.django_db
def test_worklog_infers_project_and_workspace_from_issue(workspace, create_user):
    project = Project.objects.create(name="Tracked Project", workspace=workspace)
    issue = Issue.objects.create(name="Tracked Issue", project=project, workspace=workspace)

    worklog = Worklog.objects.create(issue=issue, actor=create_user, duration=15, logged_at="2026-03-11")

    assert worklog.project == project
    assert worklog.workspace == workspace
