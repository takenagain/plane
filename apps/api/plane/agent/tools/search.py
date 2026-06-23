from django.db.models import Q

from plane.db.models import Cycle, Issue, Module, Page


def search(request_user, workspace_slug: str, query: str, project_id: str | None = None, **kwargs) -> dict:
    query = (query or "").strip()
    if not query:
        return {"issues": [], "cycles": [], "modules": [], "wiki_pages": [], "pages": []}

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

    wiki_qs = Page.objects.filter(
        workspace__slug=workspace_slug,
        is_global=True,
        parent__isnull=True,
        archived_at__isnull=True,
        name__icontains=query,
    ).filter(Q(owned_by=request_user) | Q(access=Page.PUBLIC_ACCESS))

    page_qs = Page.objects.filter(
        workspace__slug=workspace_slug,
        is_global=False,
        parent__isnull=True,
        archived_at__isnull=True,
        name__icontains=query,
        project_pages__project__project_projectmember__member=request_user,
        project_pages__project__project_projectmember__is_active=True,
        project_pages__deleted_at__isnull=True,
    ).filter(Q(owned_by=request_user) | Q(access=Page.PUBLIC_ACCESS)).distinct()

    if project_id:
        issue_qs = issue_qs.filter(project_id=project_id)
        cycle_qs = cycle_qs.filter(project_id=project_id)
        module_qs = module_qs.filter(project_id=project_id)
        page_qs = page_qs.filter(project_pages__project_id=project_id)

    return {
        "issues": [
            {"id": str(i.id), "identifier": f"{i.project.identifier}-{i.sequence_id}", "name": i.name}
            for i in issue_qs[:20]
        ],
        "cycles": [{"id": str(c.id), "name": c.name} for c in cycle_qs[:20]],
        "modules": [{"id": str(m.id), "name": m.name} for m in module_qs[:20]],
        "wiki_pages": [{"id": str(p.id), "name": p.name} for p in wiki_qs[:20]],
        "pages": [{"id": str(p.id), "name": p.name} for p in page_qs[:20]],
    }
