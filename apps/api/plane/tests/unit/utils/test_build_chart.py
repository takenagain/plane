# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from datetime import date, timedelta
from django.utils import timezone

from plane.utils.build_chart import build_time_logged_chart
from plane.db.models import Issue, Worklog
from plane.tests.factories import WorkspaceFactory, ProjectFactory


@pytest.mark.django_db
def test_time_logged_chart_weekdays_and_grouping():
    """Verify hours-logged aggregation returns correct weekday buckets and grouping."""
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    # create two issues
    issue1 = Issue.issue_objects.create(project=proj, workspace=ws, name="Issue 1")
    issue2 = Issue.issue_objects.create(project=proj, workspace=ws, name="Issue 2")

    # create worklogs on Monday and Tuesday for both issues
    monday = date(2023, 1, 2)  # Monday
    tuesday = date(2023, 1, 3)  # Tuesday

    Worklog.objects.create(issue=issue1, actor=None, duration=120, logged_at=monday)
    Worklog.objects.create(issue=issue1, actor=None, duration=60, logged_at=tuesday)
    Worklog.objects.create(issue=issue2, actor=None, duration=30, logged_at=monday)

    queryset = Issue.issue_objects.filter(project=proj)
    # request grouped by work item on weekday x-axis
    resp = build_time_logged_chart(queryset, "LOGGED_DAY_OF_WEEK", "WORK_ITEMS", (monday, tuesday))
    data = resp["data"]
    schema = resp["schema"]

    # expect seven buckets (Monday through Sunday)
    assert len(data) == 7
    # Monday bucket should have two work items stacked
    monday_bucket = next((d for d in data if d["name"] == "Monday"), None)
    assert monday_bucket is not None
    # total hours on monday: 2h + 0.5h = 2.5h
    assert abs(monday_bucket["count"] - 2.5) < 0.001
    # schema should include both issue IDs
    assert str(issue1.id) in schema
    assert str(issue2.id) in schema

    # now test simple chart (no grouping)
    resp2 = build_time_logged_chart(queryset, "LOGGED_DAY_OF_WEEK", None, (monday, tuesday))
    simple_data = resp2["data"]
    # Tuesday bucket should show 1h for issue1 only
    tue = next((d for d in simple_data if d["name"] == "Tuesday"), None)
    assert tue and abs(tue["count"] - 1.0) < 0.001


@pytest.mark.django_db
def test_time_logged_chart_excludes_soft_deleted_worklogs():
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Issue 1")

    monday = date(2023, 1, 2)

    active_worklog = Worklog.objects.create(issue=issue, actor=None, duration=60, logged_at=monday)
    deleted_worklog = Worklog.objects.create(issue=issue, actor=None, duration=120, logged_at=monday)
    Worklog.objects.filter(pk=deleted_worklog.pk).update(deleted_at=date(2023, 1, 4))

    queryset = Issue.issue_objects.filter(project=proj)
    response = build_time_logged_chart(queryset, "LOGGED_DAY_OF_WEEK", None, (monday, monday))
    monday_bucket = next((item for item in response["data"] if item["name"] == "Monday"), None)

    assert active_worklog.deleted_at is None
    assert monday_bucket is not None
    assert abs(monday_bucket["count"] - 1.0) < 0.001


@pytest.mark.django_db
def test_time_logged_chart_includes_active_tracking_time():
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Tracked issue")

    monday = date(2023, 1, 2)
    worklog = Worklog.objects.create(issue=issue, actor=ws.owner, duration=0, logged_at=monday)
    Worklog.objects.filter(pk=worklog.pk).update(created_at=timezone.now() - timedelta(minutes=90))

    queryset = Issue.issue_objects.filter(project=proj)
    response = build_time_logged_chart(queryset, "LOGGED_DAY_OF_WEEK", None, (monday, monday))
    monday_bucket = next((item for item in response["data"] if item["name"] == "Monday"), None)

    assert monday_bucket is not None
    assert abs(monday_bucket["count"] - 1.5) < 0.001


@pytest.mark.django_db
def test_time_logged_chart_supports_weekday_grouping():
    ws = WorkspaceFactory()
    proj = ProjectFactory(workspace=ws)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Grouped issue", priority="high")

    monday = date(2023, 1, 2)
    tuesday = date(2023, 1, 3)

    Worklog.objects.create(issue=issue, actor=None, duration=60, logged_at=monday)
    Worklog.objects.create(issue=issue, actor=None, duration=120, logged_at=tuesday)

    queryset = Issue.issue_objects.filter(project=proj)
    response = build_time_logged_chart(queryset, "PRIORITY", "LOGGED_DAY_OF_WEEK", (monday, tuesday))

    assert response["schema"] == {"2": "Monday", "3": "Tuesday"}
    assert response["data"] == [{"key": "high", "name": "high", "count": 3.0, "2": 1.0, "3": 2.0}]
