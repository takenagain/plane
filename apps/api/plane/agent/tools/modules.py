from plane.db.models import Issue, Module, ModuleIssue, ProjectMember
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def list_modules(request_user, workspace_slug: str, project_id: str, **kwargs) -> dict:
    if not _can_access_project(request_user, project_id):
        return {"count": 0, "modules": []}
    modules = Module.objects.filter(workspace__slug=workspace_slug, project_id=project_id, archived_at__isnull=True)
    return {
        "count": modules.count(),
        "modules": [{"id": str(m.id), "name": m.name, "status": m.status} for m in modules],
    }


def get_module(request_user, workspace_slug: str, module_id: str, **kwargs) -> dict:
    module = Module.objects.filter(id=module_id, workspace__slug=workspace_slug).first()
    if not module or not _can_access_project(request_user, str(module.project_id)):
        raise ValueError("Module not found.")
    return {
        "id": str(module.id),
        "name": module.name,
        "description": module.description,
        "status": module.status,
        "issues_count": ModuleIssue.objects.filter(module=module, deleted_at__isnull=True).count(),
    }


def create_module(
    request_user,
    workspace_slug: str,
    project_id: str,
    name: str,
    status: str = "planned",
    start_date: str | None = None,
    target_date: str | None = None,
    description: str = "",
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to create modules in this project.")
    module = Module.objects.create(
        project_id=project_id,
        name=name,
        status=status,
        start_date=start_date,
        target_date=target_date,
        description=description,
    )
    return {"created": True, "id": str(module.id), "name": module.name}


def update_module(request_user, workspace_slug: str, module_id: str, **fields) -> dict:
    module = Module.objects.filter(id=module_id, workspace__slug=workspace_slug).first()
    if not module:
        raise ValueError("Module not found.")
    if not _can_access_project(request_user, str(module.project_id), write=True):
        raise PermissionError("You do not have permission to update this module.")
    for key in ("name", "description", "status", "start_date", "target_date"):
        if key in fields and fields[key] is not None:
            setattr(module, key, fields[key])
    module.save()
    return {"updated": True, "id": str(module.id)}


def add_issues_to_module(request_user, workspace_slug: str, module_id: str, issue_ids: list[str], **kwargs) -> dict:
    module = Module.objects.filter(id=module_id, workspace__slug=workspace_slug).first()
    if not module:
        raise ValueError("Module not found.")
    if not _can_access_project(request_user, str(module.project_id), write=True):
        raise PermissionError("You do not have permission to update this module.")
    added = 0
    for issue_id in issue_ids:
        issue = Issue.issue_objects.filter(id=issue_id, project_id=module.project_id).first()
        if not issue:
            continue
        _, created = ModuleIssue.objects.get_or_create(
            module=module,
            issue=issue,
            defaults={"workspace_id": module.workspace_id, "project_id": module.project_id},
        )
        if created:
            added += 1
    return {"module_id": str(module.id), "added": added}


def remove_issue_from_module(request_user, workspace_slug: str, module_id: str, issue_id: str, **kwargs) -> dict:
    module = Module.objects.filter(id=module_id, workspace__slug=workspace_slug).first()
    if not module:
        raise ValueError("Module not found.")
    if not _can_access_project(request_user, str(module.project_id), write=True):
        raise PermissionError("You do not have permission to update this module.")
    deleted, _ = ModuleIssue.objects.filter(module=module, issue_id=issue_id).delete()
    return {"module_id": str(module.id), "issue_id": issue_id, "removed": deleted > 0}
