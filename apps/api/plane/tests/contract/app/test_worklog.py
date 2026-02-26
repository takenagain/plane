# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
from datetime import date, timedelta

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    Worklog,
    Workspace,
    WorkspaceMember,
)


class TestWorklogBase:
    """Base class with URL helpers and common fixtures for worklog tests."""

    def get_worklogs_url(self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/worklogs/"

    def get_worklogs_total_url(self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/worklogs/total/"

    def get_worklog_detail_url(
        self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID, worklog_id: uuid.UUID
    ) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/worklogs/{worklog_id}/"


@pytest.fixture
def admin_user(db):
    """Create an admin user."""
    user = User.objects.create(
        email="admin@plane.so",
        first_name="Admin",
        last_name="User",
    )
    user.set_password("admin-password")
    user.save()
    return user


@pytest.fixture
def member_user(db):
    """Create a regular member user."""
    user = User.objects.create(
        email="member@plane.so",
        first_name="Member",
        last_name="User",
    )
    user.set_password("member-password")
    user.save()
    return user


@pytest.fixture
def other_member_user(db):
    """Create another regular member user."""
    user = User.objects.create(
        email="other-member@plane.so",
        first_name="Other",
        last_name="Member",
    )
    user.set_password("other-password")
    user.save()
    return user


@pytest.fixture
def guest_user(db):
    """Create a guest user."""
    user = User.objects.create(
        email="guest@plane.so",
        first_name="Guest",
        last_name="User",
    )
    user.set_password("guest-password")
    user.save()
    return user


@pytest.fixture
def test_workspace(admin_user):
    """Create a workspace owned by admin."""
    ws = Workspace.objects.create(
        name="Test Workspace",
        slug="test-ws",
        owner=admin_user,
    )
    WorkspaceMember.objects.create(workspace=ws, member=admin_user, role=20)
    return ws


@pytest.fixture
def test_project(test_workspace, admin_user):
    """Create a project within the workspace."""
    project = Project.objects.create(
        name="Test Project",
        workspace=test_workspace,
        created_by=admin_user,
        updated_by=admin_user,
    )
    State.objects.create(
        name="Todo",
        project=project,
        workspace=test_workspace,
        created_by=admin_user,
        updated_by=admin_user,
    )
    return project


@pytest.fixture
def test_issue(test_project, test_workspace, admin_user):
    """Create an issue within the project."""
    state = State.objects.filter(project=test_project).first()
    issue = Issue.objects.create(
        name="Test Issue",
        project=test_project,
        workspace=test_workspace,
        state=state,
        created_by=admin_user,
        updated_by=admin_user,
    )
    return issue


@pytest.fixture
def setup_admin(test_project, test_workspace, admin_user):
    """Ensure admin is a project member with admin role."""
    ProjectMember.objects.get_or_create(
        project=test_project,
        member=admin_user,
        defaults={"role": 20, "is_active": True},
    )
    WorkspaceMember.objects.get_or_create(
        workspace=test_workspace,
        member=admin_user,
        defaults={"role": 20},
    )
    return admin_user


@pytest.fixture
def setup_member(test_project, test_workspace, member_user):
    """Add member_user as a project member with member role (15)."""
    WorkspaceMember.objects.get_or_create(
        workspace=test_workspace,
        member=member_user,
        defaults={"role": 15},
    )
    ProjectMember.objects.get_or_create(
        project=test_project,
        member=member_user,
        defaults={"role": 15, "is_active": True},
    )
    return member_user


@pytest.fixture
def setup_other_member(test_project, test_workspace, other_member_user):
    """Add other_member_user as a project member with member role (15)."""
    WorkspaceMember.objects.get_or_create(
        workspace=test_workspace,
        member=other_member_user,
        defaults={"role": 15},
    )
    ProjectMember.objects.get_or_create(
        project=test_project,
        member=other_member_user,
        defaults={"role": 15, "is_active": True},
    )
    return other_member_user


@pytest.fixture
def setup_guest(test_project, test_workspace, guest_user):
    """Add guest_user as a project member with guest role (5)."""
    WorkspaceMember.objects.get_or_create(
        workspace=test_workspace,
        member=guest_user,
        defaults={"role": 5},
    )
    ProjectMember.objects.get_or_create(
        project=test_project,
        member=guest_user,
        defaults={"role": 5, "is_active": True},
    )
    return guest_user


@pytest.fixture
def admin_client(api_client, setup_admin):
    """Return an authenticated API client for the admin user."""
    api_client.force_authenticate(user=setup_admin)
    return api_client


@pytest.fixture
def member_client(api_client, setup_member):
    """Return an authenticated API client for the member user."""
    api_client.force_authenticate(user=setup_member)
    return api_client


@pytest.fixture
def other_member_client(api_client, setup_other_member):
    """Return an authenticated API client for the other member user."""
    api_client.force_authenticate(user=setup_other_member)
    return api_client


@pytest.fixture
def guest_client(api_client, setup_guest):
    """Return an authenticated API client for the guest user."""
    api_client.force_authenticate(user=setup_guest)
    return api_client


@pytest.fixture
def create_worklog(test_workspace, test_project, test_issue, setup_member, member_user):
    """Helper to create a worklog owned by member_user."""

    def _create(duration=60, description="Test worklog", logged_at=None):
        if logged_at is None:
            logged_at = date.today()
        return Worklog.objects.create(
            issue=test_issue,
            project=test_project,
            workspace=test_workspace,
            actor=member_user,
            duration=duration,
            description=description,
            logged_at=logged_at,
            created_by=member_user,
            updated_by=member_user,
        )

    return _create


@pytest.fixture
def create_worklog_for_admin(test_workspace, test_project, test_issue, setup_admin, admin_user):
    """Helper to create a worklog owned by admin_user."""

    def _create(duration=60, description="Admin worklog", logged_at=None):
        if logged_at is None:
            logged_at = date.today()
        return Worklog.objects.create(
            issue=test_issue,
            project=test_project,
            workspace=test_workspace,
            actor=admin_user,
            duration=duration,
            description=description,
            logged_at=logged_at,
            created_by=admin_user,
            updated_by=admin_user,
        )

    return _create


# ==============================================================================
# FR-3: Total Time Aggregation
# ==============================================================================


@pytest.mark.contract
class TestWorklogTotal(TestWorklogBase):
    """Tests for FR-3: Total Time Aggregation endpoint."""

    @pytest.mark.django_db
    def test_total_returns_zero_when_no_worklogs(self, admin_client, test_workspace, test_project, test_issue):
        """FR-3 / AC-4: Total returns 0 when no worklogs exist."""
        url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)
        response = admin_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_duration"] == 0

    @pytest.mark.django_db
    def test_total_returns_correct_sum(self, admin_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-3 / AC-4: Total returns correct SUM of all worklog durations."""
        create_worklog(duration=60)
        create_worklog(duration=120)
        create_worklog(duration=30)

        url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)
        response = admin_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_duration"] == 210  # 60 + 120 + 30

    @pytest.mark.django_db
    def test_total_returns_single_worklog_duration(
        self, admin_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-3: Total returns correct value for a single worklog."""
        create_worklog(duration=480)

        url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)
        response = admin_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_duration"] == 480

    @pytest.mark.django_db
    def test_total_accessible_by_member(self, member_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-3: Members can access total endpoint."""
        create_worklog(duration=90)

        url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)
        response = member_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_duration"] == 90

    @pytest.mark.django_db
    def test_total_accessible_by_guest(self, guest_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-3: Guests can read total (read-only access)."""
        create_worklog(duration=45)

        url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)
        response = guest_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_duration"] == 45

    @pytest.mark.django_db
    def test_total_unauthenticated_forbidden(self, api_client, test_workspace, test_project, test_issue):
        """FR-3: Unauthenticated users cannot access total endpoint."""
        url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)
        response = api_client.get(url, format="json")

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    @pytest.mark.django_db
    def test_total_updates_after_create(self, member_client, test_workspace, test_project, test_issue):
        """FR-3: Total updates after creating a new worklog."""
        list_url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        total_url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)

        # Initially total is 0
        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 0

        # Create a worklog
        member_client.post(
            list_url,
            {"duration": 120, "logged_at": str(date.today())},
            format="json",
        )

        # Total should now be 120
        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 120

    @pytest.mark.django_db
    def test_total_updates_after_delete(self, member_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-3 / AC-8: Total updates after deleting a worklog."""
        wl1 = create_worklog(duration=60)
        create_worklog(duration=90)

        total_url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 150

        # Delete first worklog
        detail_url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, wl1.id)
        member_client.delete(detail_url, format="json")

        # Total should now reflect only the second worklog
        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 90


# ==============================================================================
# FR-4: Update Worklog
# ==============================================================================


@pytest.mark.contract
class TestWorklogUpdate(TestWorklogBase):
    """Tests for FR-4: Update Worklog endpoint."""

    @pytest.mark.django_db
    def test_update_own_worklog_duration(self, member_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-4 / AC-5: Member can update their own worklog duration."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"duration": 120}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["duration"] == 120

        worklog.refresh_from_db()
        assert worklog.duration == 120

    @pytest.mark.django_db
    def test_update_own_worklog_description(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4 / AC-5: Member can update their own worklog description."""
        worklog = create_worklog(description="Old description")
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"description": "New description"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description"] == "New description"

    @pytest.mark.django_db
    def test_update_own_worklog_logged_at(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4 / AC-5: Member can update the logged_at date."""
        worklog = create_worklog()
        yesterday = date.today() - timedelta(days=1)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"logged_at": str(yesterday)}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["logged_at"] == str(yesterday)

    @pytest.mark.django_db
    def test_partial_update_only_changes_specified_fields(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4: PATCH only updates the specified fields, leaving others unchanged."""
        worklog = create_worklog(duration=60, description="Original")
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"duration": 180}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["duration"] == 180
        assert response.data["description"] == "Original"

    @pytest.mark.django_db
    def test_update_other_members_worklog_forbidden(
        self, other_member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4 / AC-6: Member cannot update another member's worklog."""
        worklog = create_worklog(duration=60)  # Created by member_user
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = other_member_client.patch(url, {"duration": 999}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

        worklog.refresh_from_db()
        assert worklog.duration == 60  # Unchanged

    @pytest.mark.django_db
    def test_admin_can_update_any_worklog(self, admin_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-4 / AC-7: Admin can update any worklog."""
        worklog = create_worklog(duration=60)  # Created by member_user
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = admin_client.patch(url, {"duration": 200}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["duration"] == 200

    @pytest.mark.django_db
    def test_guest_cannot_update_worklog(self, guest_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-4 / AC-10: Guest cannot update worklogs."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = guest_client.patch(url, {"duration": 999}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_update_with_future_date_rejected(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4 / AC-15: logged_at in the future is rejected with 400."""
        worklog = create_worklog()
        tomorrow = date.today() + timedelta(days=1)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"logged_at": str(tomorrow)}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_update_with_zero_duration_rejected(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4 / AC-14: Duration of 0 is rejected."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"duration": 0}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_update_with_excessive_duration_rejected(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4 / AC-14: Duration exceeding 99,999 is rejected."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"duration": 100000}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_update_nonexistent_worklog_returns_404(self, member_client, test_workspace, test_project, test_issue):
        """FR-4: Updating a non-existent worklog returns 404."""
        fake_id = uuid.uuid4()
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, fake_id)

        response = member_client.patch(url, {"duration": 120}, format="json")

        assert response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN)

    @pytest.mark.django_db
    def test_update_returns_full_serialized_worklog(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4: Update response returns the full serialized worklog object."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.patch(url, {"duration": 90}, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "id" in data
        assert "issue" in data
        assert "actor" in data
        assert "duration" in data
        assert "logged_at" in data
        assert "description" in data
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.django_db
    def test_update_unauthenticated_forbidden(
        self, api_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-4: Unauthenticated users cannot update worklogs."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = api_client.patch(url, {"duration": 120}, format="json")

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# FR-5: Delete Worklog
# ==============================================================================


@pytest.mark.contract
class TestWorklogDelete(TestWorklogBase):
    """Tests for FR-5: Delete Worklog endpoint."""

    @pytest.mark.django_db
    def test_delete_own_worklog(self, member_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-5 / AC-8: Member can delete their own worklog."""
        worklog = create_worklog(duration=60)
        worklog_id = worklog.id
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.delete(url, format="json")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Worklog.objects.filter(id=worklog_id).exists()

    @pytest.mark.django_db
    def test_delete_other_members_worklog_forbidden(
        self, other_member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-5 / AC-6: Member cannot delete another member's worklog."""
        worklog = create_worklog(duration=60)  # Created by member_user
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = other_member_client.delete(url, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Worklog.objects.filter(id=worklog.id).exists()

    @pytest.mark.django_db
    def test_admin_can_delete_any_worklog(self, admin_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-5 / AC-7: Admin can delete any worklog."""
        worklog = create_worklog(duration=60)  # Created by member_user
        worklog_id = worklog.id
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = admin_client.delete(url, format="json")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Worklog.objects.filter(id=worklog_id).exists()

    @pytest.mark.django_db
    def test_guest_cannot_delete_worklog(self, guest_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-5 / AC-10: Guest cannot delete worklogs."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = guest_client.delete(url, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Worklog.objects.filter(id=worklog.id).exists()

    @pytest.mark.django_db
    def test_delete_returns_204_no_content(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-5: DELETE returns 204 No Content with empty body."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = member_client.delete(url, format="json")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_delete_nonexistent_worklog_returns_error(self, member_client, test_workspace, test_project, test_issue):
        """FR-5: Deleting a non-existent worklog returns 404."""
        fake_id = uuid.uuid4()
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, fake_id)

        response = member_client.delete(url, format="json")

        assert response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN)

    @pytest.mark.django_db
    def test_delete_worklog_updates_total(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-5 / AC-8: Deleting a worklog updates the total time."""
        wl1 = create_worklog(duration=60)
        create_worklog(duration=120)

        total_url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)

        # Verify initial total
        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 180

        # Delete first worklog
        detail_url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, wl1.id)
        member_client.delete(detail_url, format="json")

        # Total should now be 120
        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 120

    @pytest.mark.django_db
    def test_delete_worklog_removes_from_list(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-5 / AC-8: Deleting a worklog removes it from the list."""
        wl1 = create_worklog(duration=60)
        wl2 = create_worklog(duration=120)

        list_url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        # Verify initial list has 2 worklogs
        response = member_client.get(list_url, format="json")
        assert len(response.data) == 2

        # Delete first worklog
        detail_url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, wl1.id)
        member_client.delete(detail_url, format="json")

        # List should now have 1 worklog
        response = member_client.get(list_url, format="json")
        assert len(response.data) == 1
        assert response.data[0]["id"] == str(wl2.id)

    @pytest.mark.django_db
    def test_delete_all_worklogs_total_becomes_zero(
        self, member_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-5: Deleting all worklogs makes the total return to 0."""
        wl1 = create_worklog(duration=60)
        wl2 = create_worklog(duration=90)

        total_url = self.get_worklogs_total_url(test_workspace.slug, test_project.id, test_issue.id)

        # Delete both worklogs
        member_client.delete(
            self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, wl1.id),
            format="json",
        )
        member_client.delete(
            self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, wl2.id),
            format="json",
        )

        response = member_client.get(total_url, format="json")
        assert response.data["total_duration"] == 0

    @pytest.mark.django_db
    def test_delete_unauthenticated_forbidden(
        self, api_client, test_workspace, test_project, test_issue, create_worklog
    ):
        """FR-5: Unauthenticated users cannot delete worklogs."""
        worklog = create_worklog(duration=60)
        url = self.get_worklog_detail_url(test_workspace.slug, test_project.id, test_issue.id, worklog.id)

        response = api_client.delete(url, format="json")

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert Worklog.objects.filter(id=worklog.id).exists()


# ==============================================================================
# FR-1 / FR-2 Supplementary Tests (Create & List)
# Included to verify the full CRUD flow needed by FR-3, FR-4, FR-5.
# ==============================================================================


@pytest.mark.contract
class TestWorklogCreateAndList(TestWorklogBase):
    """Supplementary tests for Create and List to support FR-3/4/5 verification."""

    @pytest.mark.django_db
    def test_create_worklog_as_member(self, member_client, test_workspace, test_project, test_issue):
        """FR-1 / AC-1: A member can create a worklog with duration and optional description."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        data = {
            "duration": 120,
            "logged_at": str(date.today()),
            "description": "Implemented feature X",
        }
        response = member_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["duration"] == 120
        assert response.data["description"] == "Implemented feature X"
        assert response.data["logged_at"] == str(date.today())
        assert "id" in response.data

    @pytest.mark.django_db
    def test_create_worklog_missing_duration(self, member_client, test_workspace, test_project, test_issue):
        """FR-1 / AC-14: Missing duration returns 400."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.post(url, {"logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_create_worklog_future_date_rejected(self, member_client, test_workspace, test_project, test_issue):
        """FR-1 / AC-15: logged_at in the future is rejected."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        tomorrow = date.today() + timedelta(days=1)

        response = member_client.post(url, {"duration": 60, "logged_at": str(tomorrow)}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_guest_cannot_create_worklog(self, guest_client, test_workspace, test_project, test_issue):
        """FR-1 / AC-10: Guest cannot create worklogs."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = guest_client.post(url, {"duration": 60, "logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_list_worklogs(self, member_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-2 / AC-2: Worklogs are listed for an issue."""
        create_worklog(duration=60, description="First entry")
        create_worklog(duration=120, description="Second entry")

        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        response = member_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2

    @pytest.mark.django_db
    def test_list_worklogs_empty(self, member_client, test_workspace, test_project, test_issue):
        """FR-2: Returns empty list when no worklogs exist."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        response = member_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0

    @pytest.mark.django_db
    def test_guest_can_list_worklogs(self, guest_client, test_workspace, test_project, test_issue, create_worklog):
        """FR-2 / AC-10: Guest can read worklogs."""
        create_worklog(duration=60)

        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        response = guest_client.get(url, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1


# ==============================================================================
# Worklog Serializer Validation Tests
# ==============================================================================


@pytest.mark.contract
class TestWorklogValidation(TestWorklogBase):
    """Tests for worklog serializer validation (supports FR-3/4/5 data integrity)."""

    @pytest.mark.django_db
    def test_duration_minimum_boundary(self, member_client, test_workspace, test_project, test_issue):
        """AC-14: Duration of 1 minute is accepted (minimum valid)."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.post(url, {"duration": 1, "logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["duration"] == 1

    @pytest.mark.django_db
    def test_duration_maximum_boundary(self, member_client, test_workspace, test_project, test_issue):
        """AC-14: Duration of 99,999 minutes is accepted (maximum valid)."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.post(url, {"duration": 99999, "logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["duration"] == 99999

    @pytest.mark.django_db
    def test_duration_zero_rejected(self, member_client, test_workspace, test_project, test_issue):
        """AC-14: Duration of 0 is rejected."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.post(url, {"duration": 0, "logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_duration_over_max_rejected(self, member_client, test_workspace, test_project, test_issue):
        """AC-14: Duration exceeding 99,999 is rejected."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.post(url, {"duration": 100000, "logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_logged_at_today_accepted(self, member_client, test_workspace, test_project, test_issue):
        """AC-15: Today's date is accepted for logged_at."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)

        response = member_client.post(url, {"duration": 60, "logged_at": str(date.today())}, format="json")

        assert response.status_code == status.HTTP_201_CREATED

    @pytest.mark.django_db
    def test_logged_at_past_date_accepted(self, member_client, test_workspace, test_project, test_issue):
        """AC-15: Past date is accepted for logged_at."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        past_date = date.today() - timedelta(days=30)

        response = member_client.post(url, {"duration": 60, "logged_at": str(past_date)}, format="json")

        assert response.status_code == status.HTTP_201_CREATED

    @pytest.mark.django_db
    def test_description_max_length(self, member_client, test_workspace, test_project, test_issue):
        """Descriptions exceeding 10,000 characters are rejected."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        long_description = "a" * 10001

        response = member_client.post(
            url,
            {"duration": 60, "logged_at": str(date.today()), "description": long_description},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_description_within_limit_accepted(self, member_client, test_workspace, test_project, test_issue):
        """Description at exactly 10,000 characters is accepted."""
        url = self.get_worklogs_url(test_workspace.slug, test_project.id, test_issue.id)
        max_description = "a" * 10000

        response = member_client.post(
            url,
            {"duration": 60, "logged_at": str(date.today()), "description": max_description},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED


# ==============================================================================
# Worklog Model Integrity Tests
# ==============================================================================


@pytest.mark.contract
class TestWorklogModelIntegrity(TestWorklogBase):
    """Tests for worklog data model integrity."""

    @pytest.mark.django_db
    def test_cascade_delete_with_issue(self, test_workspace, test_project, test_issue, create_worklog):
        """NFR-4: Deleting an issue cascades to delete all associated worklogs."""
        create_worklog(duration=60)
        create_worklog(duration=120)

        assert Worklog.objects.filter(issue=test_issue).count() == 2

        test_issue.delete()

        assert Worklog.objects.filter(issue_id=test_issue.id).count() == 0

    @pytest.mark.django_db
    def test_set_null_on_user_delete(self, test_workspace, test_project, test_issue, create_worklog, member_user):
        """NFR-4: Deleting a user preserves worklogs with actor set to null."""
        worklog = create_worklog(duration=60)
        worklog_id = worklog.id

        assert worklog.actor == member_user

        member_user.delete()

        worklog.refresh_from_db()
        assert worklog.actor is None
        assert Worklog.objects.filter(id=worklog_id).exists()

    @pytest.mark.django_db
    def test_worklog_ordering(self, test_workspace, test_project, test_issue, create_worklog):
        """Worklogs are ordered by -logged_at, -created_at."""
        wl_older = create_worklog(duration=30, logged_at=date.today() - timedelta(days=2))
        wl_newer = create_worklog(duration=60, logged_at=date.today())
        wl_yesterday = create_worklog(duration=45, logged_at=date.today() - timedelta(days=1))

        worklogs = list(Worklog.objects.filter(issue=test_issue))

        # Should be ordered: newest logged_at first
        assert worklogs[0].id == wl_newer.id
        assert worklogs[1].id == wl_yesterday.id
        assert worklogs[2].id == wl_older.id
