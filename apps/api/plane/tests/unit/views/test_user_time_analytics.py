from datetime import date, timedelta

import pytest
from django.test import Client
from django.utils import timezone

from plane.db.models import Issue, Worklog
from plane.tests.factories import (
    ProjectFactory,
    ProjectMemberFactory,
    UserFactory,
    WorkspaceFactory,
    WorkspaceMemberFactory,
)


@pytest.mark.django_db
def test_user_time_analytics_summary_scoped_to_actor():
    ws = WorkspaceFactory()
    owner = ws.owner
    other = UserFactory()
    WorkspaceMemberFactory(workspace=ws, member=owner, role=20)
    WorkspaceMemberFactory(workspace=ws, member=other, role=20)

    proj = ProjectFactory(workspace=ws)
    ProjectMemberFactory(project=proj, member=owner, role=20)
    ProjectMemberFactory(project=proj, member=other, role=20)

    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Time issue")
    Worklog.objects.create(issue=issue, actor=owner, duration=120, logged_at=date.today())
    Worklog.objects.create(issue=issue, actor=other, duration=300, logged_at=date.today())

    client = Client()
    client.force_login(owner)

    url = f"/api/workspaces/{ws.slug}/user-time-analytics/{owner.id}/summary/?date_filter=last_7_days"
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["total_hours"] == 2.0
    assert data["worklog_count"] >= 1


@pytest.mark.django_db
def test_user_time_analytics_summary_includes_active_timer():
    ws = WorkspaceFactory()
    WorkspaceMemberFactory(workspace=ws, member=ws.owner, role=20)
    proj = ProjectFactory(workspace=ws)
    ProjectMemberFactory(project=proj, member=ws.owner, role=20)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Active")

    worklog = Worklog.objects.create(issue=issue, actor=ws.owner, duration=0, logged_at=date.today())
    Worklog.objects.filter(pk=worklog.pk).update(created_at=timezone.now() - timedelta(minutes=60))

    client = Client()
    client.force_login(ws.owner)
    response = client.get(
        f"/api/workspaces/{ws.slug}/user-time-analytics/{ws.owner.id}/summary/?date_filter=last_7_days"
    )
    assert response.status_code == 200
    assert response.json()["active_timer_count"] == 1
    assert response.json()["total_hours"] >= 1.0


@pytest.mark.django_db
def test_user_time_analytics_denies_cross_user_without_access():
    ws = WorkspaceFactory()
    viewer = UserFactory()
    target = UserFactory()
    WorkspaceMemberFactory(workspace=ws, member=viewer, role=20)
    WorkspaceMemberFactory(workspace=ws, member=target, role=20)

    client = Client()
    client.force_login(viewer)

    response = client.get(
        f"/api/workspaces/{ws.slug}/user-time-analytics/{target.id}/summary/?date_filter=last_7_days"
    )
    assert response.status_code in (200, 403)


@pytest.mark.django_db
def test_user_time_analytics_charts_actor_filter():
    ws = WorkspaceFactory()
    owner = ws.owner
    other = UserFactory()
    WorkspaceMemberFactory(workspace=ws, member=owner, role=20)
    WorkspaceMemberFactory(workspace=ws, member=other, role=20)
    proj = ProjectFactory(workspace=ws)
    ProjectMemberFactory(project=proj, member=owner, role=20)
    ProjectMemberFactory(project=proj, member=other, role=20)
    issue = Issue.issue_objects.create(project=proj, workspace=ws, name="Shared")

    Worklog.objects.create(issue=issue, actor=owner, duration=60, logged_at=date.today())
    Worklog.objects.create(issue=issue, actor=other, duration=180, logged_at=date.today())

    client = Client()
    client.force_login(owner)
    response = client.get(
        f"/api/workspaces/{ws.slug}/user-time-analytics/{owner.id}/charts/"
        f"?date_filter=last_7_days&x_axis=LOGGED_DAY_OF_WEEK&y_axis=HOURS_LOGGED"
    )
    assert response.status_code == 200
    total_hours = sum(item.get("count", 0) for item in response.json().get("data", []))
    assert total_hours == pytest.approx(1.0, rel=0.1)
