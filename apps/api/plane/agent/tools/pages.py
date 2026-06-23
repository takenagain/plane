from django.db.models import Q

from plane.db.models import Page, Project, ProjectMember, ProjectPage
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def _can_delete_page(request_user, project_id: str) -> bool:
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()


def _can_access_page(request_user, page: Page) -> bool:
    if page.owned_by_id == request_user.id:
        return True
    return page.access == Page.PUBLIC_ACCESS


def _project_pages_queryset(request_user, workspace_slug: str, project_id: str):
    return (
        Page.objects.filter(
            workspace__slug=workspace_slug,
            is_global=False,
            parent__isnull=True,
            archived_at__isnull=True,
            project_pages__project_id=project_id,
            project_pages__deleted_at__isnull=True,
        )
        .filter(Q(owned_by=request_user) | Q(access=Page.PUBLIC_ACCESS))
        .distinct()
    )


def list_pages(
    request_user,
    workspace_slug: str,
    project_id: str,
    query: str | None = None,
    limit: int = 20,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id):
        return {"count": 0, "pages": []}

    qs = _project_pages_queryset(request_user, workspace_slug, project_id)
    if query:
        qs = qs.filter(name__icontains=query)

    capped = max(1, min(limit or 20, 100))
    pages = list(qs.order_by("-created_at")[:capped])
    return {
        "count": len(pages),
        "pages": [
            {
                "id": str(p.id),
                "name": p.name,
                "access": "public" if p.access == Page.PUBLIC_ACCESS else "private",
                "owned_by": str(p.owned_by_id),
            }
            for p in pages
        ],
    }


def get_page(request_user, workspace_slug: str, project_id: str, page_id: str, **kwargs) -> dict:
    if not _can_access_project(request_user, project_id):
        raise PermissionError("You do not have permission to view pages in this project.")

    page = _project_pages_queryset(request_user, workspace_slug, project_id).filter(id=page_id).first()
    if not page or not _can_access_page(request_user, page):
        raise ValueError("Page not found.")

    return {
        "id": str(page.id),
        "name": page.name,
        "description": page.description_html,
        "access": "public" if page.access == Page.PUBLIC_ACCESS else "private",
        "owned_by": str(page.owned_by_id),
        "is_locked": page.is_locked,
        "project_id": project_id,
    }


def create_page(
    request_user,
    workspace_slug: str,
    project_id: str,
    name: str,
    description: str = "",
    access: str = "public",
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to create pages in this project.")

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    page = Page.objects.create(
        workspace_id=project.workspace_id,
        owned_by=request_user,
        is_global=False,
        name=name,
        description_html=description or "<p></p>",
        access=Page.PRIVATE_ACCESS if access == "private" else Page.PUBLIC_ACCESS,
    )
    ProjectPage.objects.create(
        workspace_id=project.workspace_id,
        project_id=project_id,
        page_id=page.id,
    )
    return {"created": True, "id": str(page.id), "name": page.name, "project_id": project_id}


def update_page(
    request_user,
    workspace_slug: str,
    project_id: str,
    page_id: str,
    name: str | None = None,
    description: str | None = None,
    access: str | None = None,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to update pages in this project.")

    page = _project_pages_queryset(request_user, workspace_slug, project_id).filter(id=page_id).first()
    if not page or not _can_access_page(request_user, page):
        raise ValueError("Page not found.")
    if page.is_locked:
        raise ValueError("Page is locked.")

    if name is not None:
        page.name = name
    if description is not None:
        page.description_html = description
    if access is not None:
        page.access = Page.PRIVATE_ACCESS if access == "private" else Page.PUBLIC_ACCESS
    page.save()

    return {"updated": True, "id": str(page.id), "project_id": project_id}


def delete_page(request_user, workspace_slug: str, project_id: str, page_id: str, **kwargs) -> dict:
    if not _can_delete_page(request_user, project_id):
        raise PermissionError("You do not have permission to delete pages in this project.")

    page = _project_pages_queryset(request_user, workspace_slug, project_id).filter(id=page_id).first()
    if not page:
        raise ValueError("Page not found.")

    page.delete()
    return {"deleted": True, "id": page_id, "project_id": project_id}
