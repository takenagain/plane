# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


from plane.db.models import Issue, ProjectMember, Worklog
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def _serialize_worklog(worklog: Worklog) -> dict:
    return {
        "id": str(worklog.id),
        "issue_id": str(worklog.issue_id),
        "actor_id": str(worklog.actor_id) if worklog.actor_id else None,
        "description": worklog.description,
        "duration": worklog.duration,
        "logged_at": str(worklog.logged_at),
        "is_active": worklog.duration == 0,
    }


def _get_issue(request_user, workspace_slug: str, issue_id: str) -> Issue:
    issue = Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug).select_related("project").first()
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id)):
        raise PermissionError("You do not have permission to access worklogs for this work item.")
    return issue


def list_worklogs(
    request_user,
    workspace_slug: str,
    issue_id: str,
    **kwargs,
) -> dict:
    _get_issue(request_user, workspace_slug, issue_id)
    worklogs = (
        Worklog.objects.filter(
            issue_id=issue_id,
            workspace__slug=workspace_slug,
            deleted_at__isnull=True,
        )
        .exclude(duration=0)
        .select_related("actor")
        .order_by("-logged_at", "-created_at")
    )
    total_duration = sum(w.duration for w in worklogs)
    return {
        "issue_id": issue_id,
        "total_duration": total_duration,
        "count": worklogs.count(),
        "worklogs": [_serialize_worklog(w) for w in worklogs],
    }


def create_worklog(
    request_user,
    workspace_slug: str,
    issue_id: str,
    duration: int,
    logged_at: str,
    description: str = "",
    **kwargs,
) -> dict:
    issue = _get_issue(request_user, workspace_slug, issue_id)
    if not _can_access_project(request_user, str(issue.project_id), write=True):
        raise PermissionError("You do not have permission to create worklogs for this work item.")

    if duration is None or duration < 1:
        raise ValueError("Duration must be at least 1 minute.")
    if not logged_at:
        raise ValueError("logged_at date is required.")

    worklog = Worklog.objects.create(
        issue_id=issue_id,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor=request_user,
        description=description or "",
        duration=duration,
        logged_at=logged_at,
        created_by=request_user,
        updated_by=request_user,
    )
    return {"created": True, "worklog": _serialize_worklog(worklog)}


def update_worklog(
    request_user,
    workspace_slug: str,
    issue_id: str,
    worklog_id: str,
    duration: int | None = None,
    logged_at: str | None = None,
    description: str | None = None,
    **kwargs,
) -> dict:
    issue = _get_issue(request_user, workspace_slug, issue_id)
    worklog = Worklog.objects.filter(
        id=worklog_id,
        issue_id=issue_id,
        workspace__slug=workspace_slug,
        deleted_at__isnull=True,
    ).first()
    if not worklog:
        raise ValueError("Worklog not found.")

    is_owner = worklog.actor_id == request_user.id
    is_admin = ProjectMember.objects.filter(
        project_id=issue.project_id,
        member=request_user,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()
    if not is_owner and not is_admin:
        raise PermissionError("You do not have permission to update this worklog.")

    if duration is not None:
        if duration < 1:
            raise ValueError("Duration must be at least 1 minute.")
        worklog.duration = duration
    if logged_at is not None:
        worklog.logged_at = logged_at
    if description is not None:
        worklog.description = description
    worklog.updated_by = request_user
    worklog.save()

    return {"updated": True, "worklog": _serialize_worklog(worklog)}


def delete_worklog(
    request_user,
    workspace_slug: str,
    issue_id: str,
    worklog_id: str,
    **kwargs,
) -> dict:
    issue = _get_issue(request_user, workspace_slug, issue_id)
    worklog = Worklog.objects.filter(
        id=worklog_id,
        issue_id=issue_id,
        workspace__slug=workspace_slug,
        deleted_at__isnull=True,
    ).first()
    if not worklog:
        raise ValueError("Worklog not found.")

    is_owner = worklog.actor_id == request_user.id
    is_admin = ProjectMember.objects.filter(
        project_id=issue.project_id,
        member=request_user,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()
    if not is_owner and not is_admin:
        raise PermissionError("You do not have permission to delete this worklog.")

    worklog.delete()
    return {"deleted": True, "id": worklog_id, "issue_id": issue_id}
