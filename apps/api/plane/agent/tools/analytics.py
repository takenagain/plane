
from django.db.models import Count

from plane.db.models import Issue, Project, ProjectMember
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str) -> bool:
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
        is_active=True,
    ).exists()


def _state_group_counts(base_qs) -> dict:
    grouped = base_qs.values("state__group").annotate(count=Count("id"))
    counts = {row["state__group"]: row["count"] for row in grouped if row["state__group"]}
    return {
        "total": base_qs.count(),
        "backlog": counts.get("backlog", 0),
        "unstarted": counts.get("unstarted", 0),
        "started": counts.get("started", 0),
        "completed": counts.get("completed", 0),
        "cancelled": counts.get("cancelled", 0),
    }


def get_project_analytics(
    request_user,
    workspace_slug: str,
    project_id: str,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id):
        raise PermissionError("You do not have permission to view analytics for this project.")

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    base_qs = Issue.issue_objects.filter(workspace__slug=workspace_slug, project_id=project_id)
    return {
        "project_id": project_id,
        "project_name": project.name,
        "work_items": _state_group_counts(base_qs),
    }


def get_workspace_project_stats(
    request_user,
    workspace_slug: str,
    **kwargs,
) -> dict:
    projects = Project.objects.filter(
        workspace__slug=workspace_slug,
        project_projectmember__member=request_user,
        project_projectmember__is_active=True,
        project_projectmember__role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
        archived_at__isnull=True,
    ).distinct()

    stats = []
    for project in projects:
        base_qs = Issue.issue_objects.filter(workspace__slug=workspace_slug, project_id=project.id)
        counts = _state_group_counts(base_qs)
        stats.append(
            {
                "project_id": str(project.id),
                "project_name": project.name,
                "identifier": project.identifier,
                "total_work_items": counts["total"],
                "completed_work_items": counts["completed"],
                "started_work_items": counts["started"],
            }
        )

    return {"count": len(stats), "projects": stats}
