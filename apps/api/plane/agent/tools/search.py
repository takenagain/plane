from plane.db.models import Cycle, Issue, Module


def search(request_user, workspace_slug: str, query: str, project_id: str | None = None, **kwargs) -> dict:
    query = (query or "").strip()
    if not query:
        return {"issues": [], "cycles": [], "modules": []}

    issue_qs = Issue.issue_objects.filter(
        workspace__slug=workspace_slug,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
        name__icontains=query,
    ).select_related("project")
    cycle_qs = Cycle.objects.filter(
        workspace__slug=workspace_slug,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
        name__icontains=query,
    )
    module_qs = Module.objects.filter(
        workspace__slug=workspace_slug,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
        name__icontains=query,
    )

    if project_id:
        issue_qs = issue_qs.filter(project_id=project_id)
        cycle_qs = cycle_qs.filter(project_id=project_id)
        module_qs = module_qs.filter(project_id=project_id)

    return {
        "issues": [
            {"id": str(i.id), "identifier": f"{i.project.identifier}-{i.sequence_id}", "name": i.name}
            for i in issue_qs[:20]
        ],
        "cycles": [{"id": str(c.id), "name": c.name} for c in cycle_qs[:20]],
        "modules": [{"id": str(m.id), "name": m.name} for m in module_qs[:20]],
    }
