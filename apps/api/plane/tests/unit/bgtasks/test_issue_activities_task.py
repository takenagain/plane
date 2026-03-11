# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

import pytest

from plane.bgtasks.issue_activities_task import create_worklog_activity
from plane.tests.factories import ProjectFactory, WorkspaceFactory
from plane.db.models import Issue


@pytest.mark.django_db
def test_create_worklog_activity_uses_tracking_message_for_active_timer():
    workspace = WorkspaceFactory()
    project = ProjectFactory(workspace=workspace)
    issue = Issue.issue_objects.create(project=project, workspace=workspace, name="Tracked issue")
    activities = []

    create_worklog_activity(
        requested_data=json.dumps({"duration": 0, "id": "worklog-1", "description": ""}),
        current_instance=None,
        issue_id=issue.id,
        project_id=project.id,
        workspace_id=workspace.id,
        actor_id=workspace.owner_id,
        issue_activities=activities,
        epoch=1,
    )

    assert len(activities) == 1
    assert activities[0].comment == "Started tracking time on Tracked issue"
    assert activities[0].new_value == "tracking"
