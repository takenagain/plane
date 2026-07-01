from typing import Any

from django.db import transaction

from plane.db.models import (
    GithubIssueSync,
    GithubRepository,
    GithubRepositorySync,
    Issue,
    State,
    StateGroup,
)
from plane.integrations.github.client import PLANE_SYNC_LABEL, issue_has_plane_label
from plane.utils.exception_logger import log_exception


def _resolve_state(repository: GithubRepository, github_state: str):
    mapping = (repository.config or {}).get("issue_state_mapping", {})
    state_id = mapping.get(github_state)
    if state_id:
        state = State.objects.filter(project_id=repository.project_id, pk=state_id).first()
        if state:
            return state

    if github_state == "closed":
        return (
            State.objects.filter(project_id=repository.project_id, group=StateGroup.COMPLETED.value)
            .order_by("sequence")
            .first()
        )

    return State.objects.filter(project_id=repository.project_id, default=True).first() or State.objects.filter(
        project_id=repository.project_id
    ).first()


def _get_repository_sync(repository_id: int) -> GithubRepositorySync | None:
    repository = (
        GithubRepository.objects.filter(repository_id=repository_id, deleted_at__isnull=True)
        .select_related("project", "workspace")
        .first()
    )
    if repository is None:
        return None

    return (
        GithubRepositorySync.objects.filter(repository=repository, deleted_at__isnull=True)
        .select_related("actor", "repository", "project")
        .first()
    )


@transaction.atomic
def sync_github_issue_from_webhook(issue_payload: dict[str, Any], repository_id: int) -> bool:
    if not issue_has_plane_label(issue_payload):
        return False

    repository_sync = _get_repository_sync(repository_id)
    if repository_sync is None:
        return False

    repository = repository_sync.repository
    actor = repository_sync.actor
    github_issue_id = issue_payload.get("id")
    github_state = issue_payload.get("state", "open")
    title = issue_payload.get("title") or f"GitHub issue {github_issue_id}"
    body = issue_payload.get("body") or ""
    issue_url = issue_payload.get("html_url") or ""

    issue_sync = GithubIssueSync.objects.filter(
        repository_sync=repository_sync,
        github_issue_id=github_issue_id,
        deleted_at__isnull=True,
    ).first()

    target_state = _resolve_state(repository, github_state)

    if issue_sync:
        issue = issue_sync.issue
        issue.name = title
        issue.description_html = body
        if target_state:
            issue.state = target_state
        issue.updated_by = actor
        issue.save()
        issue_sync.issue_url = issue_url
        issue_sync.save(update_fields=["issue_url", "updated_at"])
        return True

    issue = Issue(
        project=repository_sync.project,
        workspace=repository_sync.workspace,
        name=title,
        description_html=body,
        state=target_state,
        created_by=actor,
        updated_by=actor,
        external_source="github",
        external_id=str(github_issue_id),
    )
    issue.save()

    GithubIssueSync.objects.create(
        project=repository_sync.project,
        workspace=repository_sync.workspace,
        repository_sync=repository_sync,
        issue=issue,
        repo_issue_id=github_issue_id,
        github_issue_id=github_issue_id,
        issue_url=issue_url,
        created_by=actor,
        updated_by=actor,
    )
    return True


def handle_issue_webhook(payload: dict[str, Any]) -> bool:
    action = payload.get("action")
    issue_payload = payload.get("issue") or {}
    repository_payload = payload.get("repository") or {}

    if action == "labeled":
        label = (payload.get("label") or {}).get("name")
        if label != PLANE_SYNC_LABEL:
            return False
    elif action == "unlabeled":
        return False
    elif action not in ("opened", "edited", "closed", "reopened", "labeled"):
        return False

    repository_id = repository_payload.get("id")
    if not repository_id:
        return False

    try:
        return sync_github_issue_from_webhook(issue_payload, int(repository_id))
    except Exception as exc:
        log_exception(exc)
        return False
