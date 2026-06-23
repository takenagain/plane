# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


from django.db.models import Q

from plane.db.models import Page, Workspace, WorkspaceMember
from plane.db.models.project import ROLE


def _get_workspace_role(request_user, workspace_slug: str) -> int | None:
    return (
        WorkspaceMember.objects.filter(
            member=request_user,
            workspace__slug=workspace_slug,
            is_active=True,
        )
        .values_list("role", flat=True)
        .first()
    )


def _can_read_wiki(request_user, workspace_slug: str) -> bool:
    role = _get_workspace_role(request_user, workspace_slug)
    return role in [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]


def _can_write_wiki(request_user, workspace_slug: str) -> bool:
    role = _get_workspace_role(request_user, workspace_slug)
    return role in [ROLE.ADMIN.value, ROLE.MEMBER.value]


def _can_delete_wiki(request_user, workspace_slug: str) -> bool:
    role = _get_workspace_role(request_user, workspace_slug)
    return role == ROLE.ADMIN.value


def _can_access_wiki_page(request_user, page: Page) -> bool:
    if page.owned_by_id == request_user.id:
        return True
    return page.access == Page.PUBLIC_ACCESS


def _wiki_queryset(request_user, workspace_slug: str):
    return Page.objects.filter(
        workspace__slug=workspace_slug,
        is_global=True,
        parent__isnull=True,
        archived_at__isnull=True,
    ).filter(Q(owned_by=request_user) | Q(access=Page.PUBLIC_ACCESS))


def list_wiki_pages(
    request_user,
    workspace_slug: str,
    query: str | None = None,
    limit: int = 20,
    **kwargs,
) -> dict:
    if not _can_read_wiki(request_user, workspace_slug):
        raise PermissionError("You do not have permission to view wiki pages in this workspace.")

    qs = _wiki_queryset(request_user, workspace_slug)
    if query:
        qs = qs.filter(name__icontains=query)

    capped = max(1, min(limit or 20, 100))
    pages = list(qs.order_by("-created_at")[:capped])
    return {
        "count": len(pages),
        "wiki_pages": [
            {
                "id": str(p.id),
                "name": p.name,
                "access": "public" if p.access == Page.PUBLIC_ACCESS else "private",
                "owned_by": str(p.owned_by_id),
            }
            for p in pages
        ],
    }


def get_wiki_page(request_user, workspace_slug: str, page_id: str, **kwargs) -> dict:
    if not _can_read_wiki(request_user, workspace_slug):
        raise PermissionError("You do not have permission to view wiki pages in this workspace.")

    page = _wiki_queryset(request_user, workspace_slug).filter(id=page_id).first()
    if not page or not _can_access_wiki_page(request_user, page):
        raise ValueError("Wiki page not found.")

    return {
        "id": str(page.id),
        "name": page.name,
        "description": page.description_html,
        "access": "public" if page.access == Page.PUBLIC_ACCESS else "private",
        "owned_by": str(page.owned_by_id),
        "is_locked": page.is_locked,
    }


def create_wiki_page(
    request_user,
    workspace_slug: str,
    name: str,
    description: str = "",
    access: str = "public",
    **kwargs,
) -> dict:
    if not _can_write_wiki(request_user, workspace_slug):
        raise PermissionError("You do not have permission to create wiki pages in this workspace.")

    workspace = Workspace.objects.filter(slug=workspace_slug).first()
    if not workspace:
        raise ValueError("Workspace not found.")

    page = Page.objects.create(
        workspace_id=workspace.id,
        owned_by=request_user,
        is_global=True,
        name=name,
        description_html=description or "<p></p>",
        access=Page.PRIVATE_ACCESS if access == "private" else Page.PUBLIC_ACCESS,
    )
    return {"created": True, "id": str(page.id), "name": page.name}


def update_wiki_page(
    request_user,
    workspace_slug: str,
    page_id: str,
    name: str | None = None,
    description: str | None = None,
    access: str | None = None,
    **kwargs,
) -> dict:
    if not _can_write_wiki(request_user, workspace_slug):
        raise PermissionError("You do not have permission to update wiki pages in this workspace.")

    page = Page.objects.filter(id=page_id, workspace__slug=workspace_slug, is_global=True).first()
    if not page or not _can_access_wiki_page(request_user, page):
        raise ValueError("Wiki page not found.")
    if page.is_locked:
        raise ValueError("Page is locked.")

    if name is not None:
        page.name = name
    if description is not None:
        page.description_html = description
    if access is not None:
        page.access = Page.PRIVATE_ACCESS if access == "private" else Page.PUBLIC_ACCESS
    page.save()

    return {"updated": True, "id": str(page.id)}


def delete_wiki_page(request_user, workspace_slug: str, page_id: str, **kwargs) -> dict:
    if not _can_delete_wiki(request_user, workspace_slug):
        raise PermissionError("You do not have permission to delete wiki pages in this workspace.")

    page = Page.objects.filter(id=page_id, workspace__slug=workspace_slug, is_global=True).first()
    if not page:
        raise ValueError("Wiki page not found.")

    page.delete()
    return {"deleted": True, "id": page_id}
