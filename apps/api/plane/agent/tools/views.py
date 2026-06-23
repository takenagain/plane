# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


from django.db.models import Q

from plane.db.models import IssueView, Project, ProjectMember
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str) -> bool:
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value],
        is_active=True,
    ).exists()


def _views_queryset(request_user, workspace_slug: str, project_id: str):
    return (
        IssueView.objects.filter(
            workspace__slug=workspace_slug,
            project_id=project_id,
            archived_at__isnull=True,
        )
        .filter(Q(owned_by=request_user) | Q(access=1))
        .select_related("project")
        .order_by("name")
        .distinct()
    )


def list_views(
    request_user,
    workspace_slug: str,
    project_id: str,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id):
        return {"count": 0, "views": []}

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    qs = _views_queryset(request_user, workspace_slug, project_id)
    if (
        ProjectMember.objects.filter(
            project_id=project_id,
            member=request_user,
            role=ROLE.GUEST.value,
            is_active=True,
        ).exists()
        and not project.guest_view_all_features
    ):
        qs = qs.filter(owned_by=request_user)

    views = list(qs)
    return {
        "count": len(views),
        "views": [
            {
                "id": str(v.id),
                "name": v.name,
                "access": "public" if v.access == 1 else "private",
                "owned_by": str(v.owned_by_id),
            }
            for v in views
        ],
    }


def get_view(
    request_user,
    workspace_slug: str,
    project_id: str,
    view_id: str,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id):
        raise PermissionError("You do not have permission to view project views.")

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    view = _views_queryset(request_user, workspace_slug, project_id).filter(id=view_id).first()
    if not view:
        raise ValueError("View not found.")

    if (
        ProjectMember.objects.filter(
            project_id=project_id,
            member=request_user,
            role=ROLE.GUEST.value,
            is_active=True,
        ).exists()
        and not project.guest_view_all_features
        and view.owned_by_id != request_user.id
    ):
        raise PermissionError("You do not have permission to view this saved view.")

    return {
        "id": str(view.id),
        "name": view.name,
        "description": view.description,
        "filters": view.filters,
        "display_filters": view.display_filters,
        "access": "public" if view.access == 1 else "private",
        "owned_by": str(view.owned_by_id),
        "project_id": project_id,
    }
