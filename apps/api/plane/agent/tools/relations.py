from django.db.models import Q

from plane.db.models import Issue, IssueRelation, ProjectMember
from plane.db.models.project import ROLE
from plane.utils.issue_relation_mapper import get_actual_relation


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def _issue_summary(issue: Issue) -> dict:
    return {
        "id": str(issue.id),
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "name": issue.name,
    }


def _relation_type_for_issue(relation: IssueRelation, issue_id: str) -> str:
    stored_type = relation.relation_type
    if stored_type == "blocked_by":
        if str(relation.related_issue_id) == str(issue_id):
            return "blocked_by"
        return "blocking"
    if stored_type == "start_before":
        if str(relation.related_issue_id) == str(issue_id):
            return "start_before"
        return "start_after"
    if stored_type == "finish_before":
        if str(relation.related_issue_id) == str(issue_id):
            return "finish_before"
        return "finish_after"
    if stored_type == "implemented_by":
        if str(relation.related_issue_id) == str(issue_id):
            return "implemented_by"
        return "implements"
    return stored_type


def _related_issue_for_relation(relation: IssueRelation, issue_id: str) -> Issue:
    if str(relation.issue_id) == str(issue_id):
        return relation.related_issue
    return relation.issue


def list_issue_relations(
    request_user,
    workspace_slug: str,
    issue_id: str,
    **kwargs,
) -> dict:
    issue = (
        Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug)
        .select_related("project")
        .first()
    )
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id)):
        raise PermissionError("You do not have permission to view relations for this work item.")

    relations = (
        IssueRelation.objects.filter(Q(issue_id=issue_id) | Q(related_issue=issue_id))
        .filter(workspace__slug=workspace_slug, deleted_at__isnull=True)
        .select_related("issue", "related_issue", "issue__project", "related_issue__project")
        .order_by("-created_at")
    )

    grouped: dict[str, list] = {}
    for relation in relations:
        related = _related_issue_for_relation(relation, issue_id)
        relation_type = _relation_type_for_issue(relation, issue_id)
        grouped.setdefault(relation_type, []).append(_issue_summary(related))

    return {
        "issue_id": issue_id,
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "relations": grouped,
    }


def create_issue_relation(
    request_user,
    workspace_slug: str,
    issue_id: str,
    relation_type: str,
    related_issue_ids: list[str],
    **kwargs,
) -> dict:
    issue = Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug).select_related("project").first()
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id), write=True):
        raise PermissionError("You do not have permission to create relations for this work item.")

    if not relation_type:
        raise ValueError("Relation type is required.")
    if not related_issue_ids:
        raise ValueError("At least one related issue id is required.")

    stored_type = get_actual_relation(relation_type)
    created = []
    for related_id in related_issue_ids:
        if relation_type in ("blocking", "start_after", "finish_after"):
            relation = IssueRelation.objects.create(
                issue_id=related_id,
                related_issue_id=issue_id,
                relation_type=stored_type,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                created_by=request_user,
                updated_by=request_user,
            )
        else:
            relation = IssueRelation.objects.create(
                issue_id=issue_id,
                related_issue_id=related_id,
                relation_type=stored_type,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                created_by=request_user,
                updated_by=request_user,
            )
        created.append(
            {
                "id": str(relation.id),
                "relation_type": relation_type,
                "related_issue_id": related_id,
            }
        )

    return {"created": True, "issue_id": issue_id, "relations": created}


def remove_issue_relation(
    request_user,
    workspace_slug: str,
    issue_id: str,
    related_issue_id: str,
    **kwargs,
) -> dict:
    issue = Issue.issue_objects.filter(id=issue_id, workspace__slug=workspace_slug).first()
    if not issue:
        raise ValueError("Work item not found.")
    if not _can_access_project(request_user, str(issue.project_id), write=True):
        raise PermissionError("You do not have permission to remove relations for this work item.")

    relation = (
        IssueRelation.objects.filter(workspace__slug=workspace_slug, deleted_at__isnull=True)
        .filter(
            Q(issue_id=related_issue_id, related_issue_id=issue_id)
            | Q(issue_id=issue_id, related_issue_id=related_issue_id)
        )
        .first()
    )
    if not relation:
        raise ValueError("Relation not found.")

    relation.delete()
    return {"removed": True, "issue_id": issue_id, "related_issue_id": related_issue_id}
