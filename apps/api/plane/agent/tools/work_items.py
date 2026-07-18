import re

from django.db import IntegrityError
from django.db.models import Prefetch, Q

from plane.db.models import (
    EstimatePoint,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    State,
)
from plane.db.models.issue_type import ProjectIssueType
from plane.db.models.project import ROLE

BULK_UPDATE_MAX_ISSUE_IDS = 50

WORK_ITEM_SCALAR_FIELDS = frozenset(
    {
        "name",
        "description",
        "priority",
        "state_id",
        "start_date",
        "target_date",
        "parent_id",
        "estimate_point_id",
        "type_id",
    }
)


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def _issue_access_queryset(request_user, workspace_slug: str):
    return Issue.issue_objects.filter(
        workspace__slug=workspace_slug,
        project__project_projectmember__member=request_user,
        project__project_projectmember__is_active=True,
    ).select_related("project", "state", "estimate_point", "type")


def _serialize_work_item_summary(issue: Issue) -> dict:
    return {
        "id": str(issue.id),
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "name": issue.name,
        "priority": issue.priority,
        "state": issue.state.name if issue.state else None,
        "state_id": str(issue.state_id) if issue.state_id else None,
        "start_date": issue.start_date.isoformat() if issue.start_date else None,
        "target_date": issue.target_date.isoformat() if issue.target_date else None,
        "assignees": [str(row.assignee_id) for row in issue.issue_assignee.all()],
        "label_ids": [str(row.label_id) for row in issue.label_issue.all()],
        "estimate_point_id": str(issue.estimate_point_id) if issue.estimate_point_id else None,
        "type_id": str(issue.type_id) if issue.type_id else None,
    }


def _filter_assignee_ids(project_id: str, assignee_ids: list[str] | None) -> list:
    if not assignee_ids:
        return []
    return list(
        ProjectMember.objects.filter(
            project_id=project_id,
            role__gte=ROLE.MEMBER.value,
            is_active=True,
            member_id__in=assignee_ids,
        ).values_list("member_id", flat=True)
    )


def _filter_label_ids(project_id: str, label_ids: list[str] | None) -> list:
    if not label_ids:
        return []
    return list(Label.objects.filter(project_id=project_id, id__in=label_ids).values_list("id", flat=True))


def _validate_state_id(project_id: str, state_id: str | None) -> str | None:
    if not state_id:
        return None
    if not State.objects.filter(project_id=project_id, pk=state_id).exists():
        raise ValueError("State is not valid please pass a valid state_id")
    return state_id


def _validate_parent_id(project_id: str, parent_id: str | None) -> str | None:
    if not parent_id:
        return None
    if not Issue.objects.filter(project_id=project_id, pk=parent_id).exists():
        raise ValueError("Parent is not valid issue_id please pass a valid issue_id")
    return parent_id


def _serialize_work_item_detail(issue: Issue) -> dict:
    payload = _serialize_work_item_summary(issue)
    payload.update(
        {
            "description": issue.description_html,
            "labels": payload.pop("label_ids"),
            "comments_count": issue.issue_comments.filter(deleted_at__isnull=True).count(),
        }
    )
    return payload


def _apply_work_item_updates(issue: Issue, fields: dict) -> None:
    assignee_ids = fields.pop("assignee_ids", None)
    label_ids = fields.pop("label_ids", None)
    project_id = str(issue.project_id)

    if "state_id" in fields and fields["state_id"] is not None:
        fields["state_id"] = _validate_state_id(project_id, fields["state_id"])
    if "parent_id" in fields and fields["parent_id"] is not None:
        fields["parent_id"] = _validate_parent_id(project_id, fields["parent_id"])

    updatable = {k: v for k, v in fields.items() if k in WORK_ITEM_SCALAR_FIELDS and v is not None}
    if "description" in updatable:
        updatable["description_html"] = updatable.pop("description")
    for key, value in updatable.items():
        setattr(issue, key, value)
    if updatable:
        issue.save()

    if assignee_ids is not None:
        IssueAssignee.objects.filter(issue=issue).delete()
        valid_assignee_ids = _filter_assignee_ids(project_id, assignee_ids)
        if valid_assignee_ids:
            IssueAssignee.objects.bulk_create(
                [
                    IssueAssignee(
                        assignee_id=assignee_id,
                        issue=issue,
                        project_id=issue.project_id,
                        workspace_id=issue.workspace_id,
                    )
                    for assignee_id in valid_assignee_ids
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

    if label_ids is not None:
        IssueLabel.objects.filter(issue=issue).delete()
        valid_label_ids = _filter_label_ids(project_id, label_ids)
        if valid_label_ids:
            IssueLabel.objects.bulk_create(
                [
                    IssueLabel(
                        label_id=label_id,
                        issue=issue,
                        project_id=issue.project_id,
                        workspace_id=issue.workspace_id,
                    )
                    for label_id in valid_label_ids
                ],
                batch_size=10,
                ignore_conflicts=True,
            )


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
    qs = _issue_access_queryset(request_user, workspace_slug).prefetch_related(
        Prefetch("issue_assignee"),
        Prefetch("label_issue"),
    )
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
        "issues": [_serialize_work_item_summary(i) for i in issues],
    }


def get_work_item(
    request_user,
    workspace_slug: str,
    issue_id: str | None = None,
    identifier: str | None = None,
    **kwargs,
) -> dict:
    qs = _issue_access_queryset(request_user, workspace_slug).prefetch_related(
        Prefetch("issue_assignee"),
        Prefetch("label_issue"),
    )

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

    return _serialize_work_item_detail(issue)


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
    estimate_point_id: str | None = None,
    type_id: str | None = None,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to create issues in this project.")

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    if estimate_point_id and not EstimatePoint.objects.filter(id=estimate_point_id, project_id=project_id).exists():
        raise ValueError("Estimate point not found in project.")

    if type_id and not ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=type_id).exists():
        raise ValueError("Issue type not found in project.")

    if state_id:
        state_id = _validate_state_id(project_id, state_id)
    if parent_id:
        parent_id = _validate_parent_id(project_id, parent_id)

    valid_assignee_ids = _filter_assignee_ids(project_id, assignee_ids)
    valid_label_ids = _filter_label_ids(project_id, label_ids)

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
        estimate_point_id=estimate_point_id,
        type_id=type_id,
    )

    for assignee_id in valid_assignee_ids:
        IssueAssignee.objects.get_or_create(
            issue=issue,
            assignee_id=assignee_id,
            defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
        )

    for label_id in valid_label_ids:
        label = Label.objects.filter(id=label_id, project_id=project_id).first()
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

    if fields.get("estimate_point_id") and not EstimatePoint.objects.filter(
        id=fields["estimate_point_id"], project_id=issue.project_id
    ).exists():
        raise ValueError("Estimate point not found in project.")

    if fields.get("type_id") and not ProjectIssueType.objects.filter(
        project_id=issue.project_id, issue_type_id=fields["type_id"]
    ).exists():
        raise ValueError("Issue type not found in project.")

    _apply_work_item_updates(issue, dict(fields))
    return {"updated": True, "id": str(issue.id)}


def bulk_update_work_items(
    request_user,
    workspace_slug: str,
    issue_ids: list[str],
    **fields,
) -> dict:
    if not issue_ids:
        raise ValueError("issue_ids is required and must not be empty.")
    if len(issue_ids) > BULK_UPDATE_MAX_ISSUE_IDS:
        raise ValueError(f"issue_ids cannot exceed {BULK_UPDATE_MAX_ISSUE_IDS} items.")

    updated_ids: list[str] = []
    errors: list[dict] = []
    for issue_id in issue_ids:
        try:
            result = update_work_item(request_user, workspace_slug, issue_id, **fields)
            updated_ids.append(result["id"])
        except (ValueError, PermissionError, IntegrityError) as exc:
            errors.append({"issue_id": issue_id, "error": str(exc)})
        except Exception as exc:
            errors.append({"issue_id": issue_id, "error": str(exc)})

    return {
        "updated_count": len(updated_ids),
        "updated_ids": updated_ids,
        "errors": errors,
    }


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
