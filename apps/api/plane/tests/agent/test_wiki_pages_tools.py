# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


import pytest

from plane.agent.tools.pages import create_page, get_page, list_pages, update_page
from plane.agent.tools.registry import TOOL_REGISTRY, get_tool_definitions
from plane.agent.tools.search import search
from plane.agent.tools.wiki import create_wiki_page, get_wiki_page, list_wiki_pages, update_wiki_page
from plane.db.models import Page, Project, ProjectMember, ProjectPage, WorkspaceMember
from plane.db.models.project import ROLE


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Test Project",
        identifier="TEST",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=ROLE.ADMIN.value,
        is_active=True,
    )
    return project


@pytest.mark.unit
@pytest.mark.django_db
class TestWikiPageTools:
    def test_list_and_get_wiki_page(self, create_user, workspace):
        created = create_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            name="Getting Started",
            description="<p>Welcome</p>",
        )
        listing = list_wiki_pages(request_user=create_user, workspace_slug=workspace.slug)
        assert listing["count"] == 1
        assert listing["wiki_pages"][0]["name"] == "Getting Started"

        detail = get_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            page_id=created["id"],
        )
        assert detail["name"] == "Getting Started"
        assert "Welcome" in detail["description"]

    def test_update_wiki_page(self, create_user, workspace):
        created = create_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            name="Draft",
        )
        update_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            page_id=created["id"],
            name="Published",
            description="<p>Updated</p>",
        )
        detail = get_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            page_id=created["id"],
        )
        assert detail["name"] == "Published"
        assert "Updated" in detail["description"]

    def test_update_locked_wiki_page_rejected(self, create_user, workspace):
        created = create_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            name="Locked Doc",
        )
        Page.objects.filter(id=created["id"]).update(is_locked=True)

        with pytest.raises(ValueError, match="Page is locked"):
            update_wiki_page(
                request_user=create_user,
                workspace_slug=workspace.slug,
                page_id=created["id"],
                name="Should Fail",
            )


    def test_private_wiki_page_hidden_from_other_members(self, create_user, workspace, db):
        from plane.db.models import User

        other = User.objects.create(email="other@plane.so", username="other@plane.so")
        WorkspaceMember.objects.create(workspace=workspace, member=other, role=ROLE.MEMBER.value, is_active=True)

        created = create_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            name="Private Notes",
            access="private",
        )
        listing = list_wiki_pages(request_user=other, workspace_slug=workspace.slug)
        assert listing["count"] == 0

        with pytest.raises(ValueError, match="Wiki page not found"):
            get_wiki_page(request_user=other, workspace_slug=workspace.slug, page_id=created["id"])


@pytest.mark.unit
@pytest.mark.django_db
class TestProjectPageTools:
    def test_list_create_and_get_page(self, create_user, workspace, project):
        created = create_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="Sprint Notes",
            description="<p>Notes</p>",
        )
        assert Page.objects.filter(id=created["id"], is_global=False).exists()
        assert ProjectPage.objects.filter(page_id=created["id"], project_id=project.id).exists()

        listing = list_pages(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
        )
        assert listing["count"] == 1

        detail = get_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            page_id=created["id"],
        )
        assert detail["name"] == "Sprint Notes"

    def test_update_page(self, create_user, workspace, project):
        created = create_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="Old Title",
        )
        update_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            page_id=created["id"],
            name="New Title",
        )
        detail = get_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            page_id=created["id"],
        )
        assert detail["name"] == "New Title"

    def test_update_locked_page_rejected(self, create_user, workspace, project):
        created = create_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="Locked Page",
        )
        Page.objects.filter(id=created["id"]).update(is_locked=True)

        with pytest.raises(ValueError, match="Page is locked"):
            update_page(
                request_user=create_user,
                workspace_slug=workspace.slug,
                project_id=str(project.id),
                page_id=created["id"],
                name="Should Fail",
            )


@pytest.mark.unit
@pytest.mark.django_db
class TestSearchIncludesPages:
    def test_search_returns_wiki_and_project_pages(self, create_user, workspace, project):
        create_wiki_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            name="Architecture Overview",
        )
        create_page(
            request_user=create_user,
            workspace_slug=workspace.slug,
            project_id=str(project.id),
            name="Architecture Doc",
        )

        results = search(
            request_user=create_user,
            workspace_slug=workspace.slug,
            query="Architecture",
            project_id=str(project.id),
        )
        assert len(results["wiki_pages"]) == 1
        assert len(results["pages"]) == 1


@pytest.mark.unit
class TestToolRegistry:
    def test_wiki_and_page_tools_registered(self):
        expected = {
            "list_wiki_pages",
            "get_wiki_page",
            "create_wiki_page",
            "update_wiki_page",
            "delete_wiki_page",
            "list_pages",
            "get_page",
            "create_page",
            "update_page",
            "delete_page",
        }
        assert expected.issubset(set(TOOL_REGISTRY.keys()))

        tool_names = {definition["function"]["name"] for definition in get_tool_definitions()}
        assert expected.issubset(tool_names)
