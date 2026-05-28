from plane.db.models import Label, Project, ProjectMember, State, WorkspaceMember


def list_states(request_user, workspace_slug: str, project_id: str, **kwargs) -> dict:
    states = State.objects.filter(
        workspace__slug=workspace_slug,
        project_id=project_id,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
    )
    return {"count": states.count(), "states": [{"id": str(s.id), "name": s.name, "group": s.group} for s in states]}


def list_labels(request_user, workspace_slug: str, project_id: str, **kwargs) -> dict:
    labels = Label.objects.filter(
        workspace__slug=workspace_slug,
        project_id=project_id,
    )
    if project_id:
        labels = labels.filter(project__project_projectmember__member=request_user, project__project_projectmember__is_active=True)
    return {"count": labels.count(), "labels": [{"id": str(l.id), "name": l.name, "color": l.color} for l in labels]}


def list_members(request_user, workspace_slug: str, project_id: str | None = None, **kwargs) -> dict:
    if project_id:
        members = ProjectMember.objects.filter(project_id=project_id, is_active=True).select_related("member")
        return {
            "count": members.count(),
            "members": [{"id": str(m.member_id), "display_name": m.member.display_name, "role": m.role} for m in members],
        }

    members = WorkspaceMember.objects.filter(workspace__slug=workspace_slug, is_active=True).select_related("member")
    return {
        "count": members.count(),
        "members": [{"id": str(m.member_id), "display_name": m.member.display_name, "role": m.role} for m in members],
    }


def list_projects(request_user, workspace_slug: str, **kwargs) -> dict:
    projects = Project.objects.filter(
        workspace__slug=workspace_slug,
        project_projectmember__member=request_user,
        project_projectmember__is_active=True,
        archived_at__isnull=True,
    ).distinct()
    return {
        "count": projects.count(),
        "projects": [{"id": str(p.id), "identifier": p.identifier, "name": p.name} for p in projects],
    }
