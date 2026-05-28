from plane.db.models import Cycle, CycleIssue, Issue, ProjectMember
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def list_cycles(request_user, workspace_slug: str, project_id: str, **kwargs) -> dict:
    if not _can_access_project(request_user, project_id):
        return {"count": 0, "cycles": []}
    cycles = Cycle.objects.filter(workspace__slug=workspace_slug, project_id=project_id, archived_at__isnull=True)
    return {
        "count": cycles.count(),
        "cycles": [{"id": str(c.id), "name": c.name, "start_date": c.start_date, "end_date": c.end_date} for c in cycles],
    }


def get_cycle(request_user, workspace_slug: str, cycle_id: str, **kwargs) -> dict:
    cycle = Cycle.objects.filter(id=cycle_id, workspace__slug=workspace_slug).first()
    if not cycle or not _can_access_project(request_user, str(cycle.project_id)):
        raise ValueError("Cycle not found.")
    return {
        "id": str(cycle.id),
        "name": cycle.name,
        "description": cycle.description,
        "start_date": cycle.start_date,
        "end_date": cycle.end_date,
        "issues_count": CycleIssue.objects.filter(cycle=cycle, deleted_at__isnull=True).count(),
    }


def create_cycle(
    request_user,
    workspace_slug: str,
    project_id: str,
    name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    description: str = "",
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to create cycles in this project.")
    cycle = Cycle.objects.create(
        project_id=project_id,
        owned_by=request_user,
        name=name,
        description=description,
        start_date=start_date,
        end_date=end_date,
    )
    return {"created": True, "id": str(cycle.id), "name": cycle.name}


def update_cycle(request_user, workspace_slug: str, cycle_id: str, **fields) -> dict:
    cycle = Cycle.objects.filter(id=cycle_id, workspace__slug=workspace_slug).first()
    if not cycle:
        raise ValueError("Cycle not found.")
    if not _can_access_project(request_user, str(cycle.project_id), write=True):
        raise PermissionError("You do not have permission to update this cycle.")
    for key in ("name", "description", "start_date", "end_date"):
        if key in fields and fields[key] is not None:
            setattr(cycle, key, fields[key])
    cycle.save()
    return {"updated": True, "id": str(cycle.id)}


def add_issues_to_cycle(request_user, workspace_slug: str, cycle_id: str, issue_ids: list[str], **kwargs) -> dict:
    cycle = Cycle.objects.filter(id=cycle_id, workspace__slug=workspace_slug).first()
    if not cycle:
        raise ValueError("Cycle not found.")
    if not _can_access_project(request_user, str(cycle.project_id), write=True):
        raise PermissionError("You do not have permission to update this cycle.")
    added = 0
    for issue_id in issue_ids:
        issue = Issue.issue_objects.filter(id=issue_id, project_id=cycle.project_id).first()
        if not issue:
            continue
        _, created = CycleIssue.objects.get_or_create(
            cycle=cycle,
            issue=issue,
            defaults={"workspace_id": cycle.workspace_id, "project_id": cycle.project_id},
        )
        if created:
            added += 1
    return {"cycle_id": str(cycle.id), "added": added}


def remove_issue_from_cycle(request_user, workspace_slug: str, cycle_id: str, issue_id: str, **kwargs) -> dict:
    cycle = Cycle.objects.filter(id=cycle_id, workspace__slug=workspace_slug).first()
    if not cycle:
        raise ValueError("Cycle not found.")
    if not _can_access_project(request_user, str(cycle.project_id), write=True):
        raise PermissionError("You do not have permission to update this cycle.")
    deleted, _ = CycleIssue.objects.filter(cycle=cycle, issue_id=issue_id).delete()
    return {"cycle_id": str(cycle.id), "issue_id": issue_id, "removed": deleted > 0}
