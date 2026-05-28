import re

from django.db.models import Q

from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    State,
)
from plane.db.models.project import ROLE


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def list_work_items(
    request_user,
    workspace_slug: str,
    project_id: str | None = None,
    state_id: str | None = None,
    priority: str | None = None,
    query: str | None = None,
    limit: int = 20,
    **kwargs,
) -> dict:
    qs = Issue.issue_objects.filter(
        workspace__slug=workspace_slug,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
    ).select_related("state", "project")
    if project_id:
        qs = qs.filter(project_id=project_id)
    if state_id:
        qs = qs.filter(state_id=state_id)
    if priority:
        qs = qs.filter(priority=priority)
    if query:
        qs = qs.filter(Q(name__icontains=query) | Q(description_stripped__icontains=query))

    capped = max(1, min(limit or 20, 100))
    issues = list(qs[:capped])
    return {
        "count": len(issues),
        "issues": [
            {
                "id": str(i.id),
                "identifier": f"{i.project.identifier}-{i.sequence_id}",
                "name": i.name,
                "priority": i.priority,
                "state": i.state.name if i.state else None,
                "assignees": [str(assignee.id) for assignee in i.assignees.all()],
            }
            for i in issues
        ],
    }


def get_work_item(request_user, workspace_slug: str, issue_id: str | None = None, identifier: str | None = None, **kwargs) -> dict:
    qs = Issue.issue_objects.filter(
        workspace__slug=workspace_slug,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
    ).select_related("project", "state")

    issue = None
    if issue_id:
        issue = qs.filter(id=issue_id).first()
    elif identifier:
        match = re.match(r"^([A-Za-z0-9]+)-(\d+)$", identifier.strip())
        if match:
            project_key, sequence = match.group(1).upper(), int(match.group(2))
            issue = qs.filter(project__identifier=project_key, sequence_id=sequence).first()

    if not issue:
        raise ValueError("Work item not found.")

    return {
        "id": str(issue.id),
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "name": issue.name,
        "description": issue.description_html,
        "priority": issue.priority,
        "state_id": str(issue.state_id) if issue.state_id else None,
        "labels": [str(label.id) for label in issue.labels.all()],
        "assignees": [str(assignee.id) for assignee in issue.assignees.all()],
        "comments_count": issue.issue_comments.filter(deleted_at__isnull=True).count(),
    }


def create_work_item(
    request_user,
    workspace_slug: str,
    project_id: str,
    name: str,
    description: str = "",
    priority: str = "none",
    state_id: str | None = None,
    assignee_ids: list[str] | None = None,
    label_ids: list[str] | None = None,
    start_date: str | None = None,
    target_date: str | None = None,
    parent_id: str | None = None,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to create issues in this project.")

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    if not state_id:
        default_state = State.objects.filter(project_id=project_id, default=True).first() or State.objects.filter(
            project_id=project_id
        ).first()
        state_id = str(default_state.id) if default_state else None

    issue = Issue.objects.create(
        workspace_id=project.workspace_id,
        project_id=project_id,
        state_id=state_id,
        name=name,
        description_html=description or "<p></p>",
        priority=priority,
        start_date=start_date,
        target_date=target_date,
        parent_id=parent_id,
    )

    for assignee_id in assignee_ids or []:
        IssueAssignee.objects.get_or_create(
            issue=issue,
            assignee_id=assignee_id,
            defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
        )

    for label_id in label_ids or []:
        label = Label.objects.filter(id=label_id, workspace_id=issue.workspace_id).first()
        if not label:
            continue
        IssueLabel.objects.get_or_create(
            issue=issue,
            label=label,
            defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
        )

    return {
        "created": True,
        "id": str(issue.id),
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "name": issue.name,
    }


def update_work_item(request_user, workspace_slug: str, issue_id: str, **fields) -> dict:
    issue = Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug).select_related("project").first()
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id), write=True):
        raise PermissionError("You do not have permission to update this work item.")

    assignee_ids = fields.pop("assignee_ids", None)
    label_ids = fields.pop("label_ids", None)
    updatable = {
        k: v
        for k, v in fields.items()
        if k in {"name", "description", "priority", "state_id", "start_date", "target_date", "parent_id"} and v is not None
    }
    if "description" in updatable:
        updatable["description_html"] = updatable.pop("description")
    for key, value in updatable.items():
        setattr(issue, key, value)
    if updatable:
        issue.save()

    if assignee_ids is not None:
        IssueAssignee.objects.filter(issue=issue).exclude(assignee_id__in=assignee_ids).delete()
        for assignee_id in assignee_ids:
            IssueAssignee.objects.get_or_create(
                issue=issue,
                assignee_id=assignee_id,
                defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
            )

    if label_ids is not None:
        IssueLabel.objects.filter(issue=issue).exclude(label_id__in=label_ids).delete()
        for label_id in label_ids:
            IssueLabel.objects.get_or_create(
                issue=issue,
                label_id=label_id,
                defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
            )

    return {"updated": True, "id": str(issue.id)}


def delete_work_item(request_user, workspace_slug: str, issue_id: str, **kwargs) -> dict:
    issue = Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug).first()
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id), write=True):
        raise PermissionError("You do not have permission to delete this work item.")

    issue.delete()
    return {"deleted": True, "id": issue_id}


def add_work_item_comment(request_user, workspace_slug: str, issue_id: str, comment: str, **kwargs) -> dict:
    issue = Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug).first()
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id), write=True):
        raise PermissionError("You do not have permission to comment on this work item.")

    created = IssueComment.objects.create(
        workspace_id=issue.workspace_id,
        project_id=issue.project_id,
        issue=issue,
        actor=request_user,
        comment_html=comment,
    )
    return {"id": str(created.id), "issue_id": str(issue.id), "comment": created.comment_html}
