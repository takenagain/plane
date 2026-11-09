# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""``IssueActivityEndpoint`` without ``activity_type`` merges activities and comments.

It used to sort raw model instances with ``instance["created_at"]`` and raise
``TypeError: 'IssueActivity' object is not subscriptable`` (500). Serializing
those dictionaries again also fails on UUID relations; serialize each row once
and retain the nested details in the merged JSON response.
"""

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueActivity, IssueComment, Project, ProjectMember, State


@pytest.mark.contract
@pytest.mark.django_db
def test_history_merges_activities_and_comments_sorted(session_client, workspace, create_user):
    project = Project.objects.create(name="P", identifier="P", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
    issue = Issue.objects.create(name="I", workspace=workspace, project=project, state=state, created_by=create_user)
    activity = IssueActivity.objects.create(
        issue=issue, project=project, workspace=workspace, actor=create_user, verb="created", field="state"
    )
    comment = IssueComment.objects.create(
        issue=issue, project=project, workspace=workspace, actor=create_user, comment_html="<p>hi</p>"
    )

    response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/history/")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 2
    created = [row["created_at"] for row in response.data]
    assert created == sorted(created)

    activity_entry = next(row for row in response.json() if str(row["id"]) == str(activity.id))
    comment_entry = next(row for row in response.json() if str(row["id"]) == str(comment.id))
    assert str(activity_entry["actor"]) == str(create_user.id)
    assert activity_entry["actor_detail"]["id"] == str(create_user.id)
    assert activity_entry["issue_detail"]["id"] == str(issue.id)
    assert comment_entry["comment_html"] == "<p>hi</p>"
    assert comment_entry["actor_detail"]["id"] == str(create_user.id)
