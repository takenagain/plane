import html
import threading

import requests

from plane.db.models import Issue, SentryIssueLink, SentryProjectMapping, SentryWorkspaceConnection
from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.integrations.sentry.config import get_sentry_api_base
from plane.utils.content_validator import validate_html_content

_sentry_sync_local = threading.local()


def is_sentry_sync_in_progress() -> bool:
    return bool(getattr(_sentry_sync_local, "active", False))


def set_sentry_sync_in_progress(active: bool) -> None:
    _sentry_sync_local.active = active


def get_access_token(connection: SentryWorkspaceConnection) -> str:
    return decrypt_data(connection.access_token_encrypted)


def extract_issue_payload(payload: dict) -> tuple[dict | None, str | None]:
    data = payload.get("data") or {}
    issue = data.get("issue") or payload.get("issue")
    if not issue:
        return None, None

    project_slug = None
    project = issue.get("project") or data.get("project") or payload.get("project")
    if isinstance(project, dict):
        project_slug = project.get("slug")
    elif isinstance(project, str):
        project_slug = project

    return issue, project_slug


def extract_action(payload: dict) -> str:
    return (payload.get("action") or payload.get("event") or "").lower()


def priority_from_sentry(issue: dict) -> str:
    level = (issue.get("level") or issue.get("metadata", {}).get("level") or "").lower()
    mapping = {
        "fatal": "urgent",
        "error": "high",
        "warning": "medium",
        "info": "low",
    }
    return mapping.get(level, "none")


def build_description_html(issue: dict) -> str:
    title = html.escape(issue.get("title") or issue.get("culprit") or "Sentry issue")
    permalink = issue.get("permalink") or issue.get("url") or issue.get("web_url") or ""
    culprit = html.escape(issue.get("culprit") or "")
    parts = [f"<p><strong>{title}</strong></p>"]
    if culprit:
        parts.append(f"<p>{culprit}</p>")
    if permalink:
        safe_link = html.escape(permalink)
        parts.append(f'<p><a href="{safe_link}" rel="noopener noreferrer">View in Sentry</a></p>')
    description = "".join(parts)
    _, _, sanitized = validate_html_content(description)
    return sanitized or description


def upsert_issue_from_sentry(
    *,
    mapping: SentryProjectMapping,
    connection: SentryWorkspaceConnection,
    issue_payload: dict,
    resolved: bool | None = None,
) -> Issue:
    sentry_issue_id = str(issue_payload.get("id") or issue_payload.get("issue_id") or "")
    if not sentry_issue_id:
        raise ValueError("Missing Sentry issue id")

    if resolved is None:
        status = (issue_payload.get("status") or "").lower()
        resolved = status in ("resolved", "ignored", "archived")

    title = issue_payload.get("title") or issue_payload.get("culprit") or "Sentry issue"
    name = title if title.startswith("[Sentry]") else f"[Sentry] {title}"

    link = (
        SentryIssueLink.objects.filter(
            mapping=mapping,
            sentry_issue_id=sentry_issue_id,
            deleted_at__isnull=True,
        )
        .select_related("issue")
        .first()
    )

    set_sentry_sync_in_progress(True)
    try:
        if link:
            issue = link.issue
            issue.name = name
            issue.description_html = build_description_html(issue_payload)
            issue.state_id = mapping.resolved_state_id if resolved else mapping.unresolved_state_id
            issue.save(update_fields=["name", "description_html", "state_id", "updated_at"])
            return issue

        issue = Issue.objects.create(
            workspace_id=mapping.workspace_id,
            project_id=mapping.project_id,
            name=name,
            description_html=build_description_html(issue_payload),
            state_id=mapping.resolved_state_id if resolved else mapping.unresolved_state_id,
            priority=priority_from_sentry(issue_payload),
            external_source="sentry",
            external_id=sentry_issue_id,
        )
        SentryIssueLink.objects.create(
            workspace_id=mapping.workspace_id,
            project_id=mapping.project_id,
            issue=issue,
            sentry_issue_id=sentry_issue_id,
            sentry_project_slug=mapping.sentry_project_slug,
            mapping=mapping,
        )
        return issue
    finally:
        set_sentry_sync_in_progress(False)


def handle_alert_webhook(*, connection: SentryWorkspaceConnection, payload: dict, project_slug: str | None) -> Issue:
    issue_payload, extracted_slug = extract_issue_payload(payload)
    slug = project_slug or extracted_slug
    if not issue_payload or not slug:
        raise ValueError("Invalid Sentry webhook payload")

    mapping = SentryProjectMapping.objects.filter(
        workspace_id=connection.workspace_id,
        sentry_project_slug=slug,
        deleted_at__isnull=True,
    ).first()
    if not mapping:
        raise LookupError(f"No mapping for Sentry project '{slug}'")

    action = extract_action(payload)
    resolved = action in ("resolved", "archived", "ignored")
    unresolved = action in ("unresolved", "regressed", "created", "triggered", "assigned")

    if resolved:
        return upsert_issue_from_sentry(
            mapping=mapping, connection=connection, issue_payload=issue_payload, resolved=True
        )
    if unresolved:
        return upsert_issue_from_sentry(
            mapping=mapping, connection=connection, issue_payload=issue_payload, resolved=False
        )

    status = (issue_payload.get("status") or "").lower()
    return upsert_issue_from_sentry(
        mapping=mapping,
        connection=connection,
        issue_payload=issue_payload,
        resolved=status in ("resolved", "ignored", "archived"),
    )


def sync_plane_state_to_sentry(issue: Issue) -> None:
    if is_sentry_sync_in_progress():
        return

    link = (
        SentryIssueLink.objects.filter(issue_id=issue.id, deleted_at__isnull=True)
        .select_related("mapping", "mapping__workspace")
        .first()
    )
    if not link:
        return

    connection = SentryWorkspaceConnection.objects.filter(workspace_id=issue.workspace_id).first()
    if not connection:
        return

    access_token = get_access_token(connection)
    if not access_token:
        return

    mapping = link.mapping
    if issue.state_id == mapping.resolved_state_id:
        status = "resolved"
    elif issue.state_id == mapping.unresolved_state_id:
        status = "unresolved"
    else:
        return

    api_base = get_sentry_api_base()
    requests.put(
        f"{api_base}/api/0/issues/{link.sentry_issue_id}/",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"status": status},
        timeout=30,
    ).raise_for_status()


def link_sentry_issue_to_plane_issue(
    *,
    mapping: SentryProjectMapping,
    connection: SentryWorkspaceConnection,
    sentry_issue_id: str,
    plane_issue: Issue,
    issue_payload: dict | None = None,
) -> SentryIssueLink:
    link, created = SentryIssueLink.objects.get_or_create(
        issue=plane_issue,
        defaults={
            "workspace_id": mapping.workspace_id,
            "project_id": mapping.project_id,
            "sentry_issue_id": sentry_issue_id,
            "sentry_project_slug": mapping.sentry_project_slug,
            "mapping": mapping,
        },
    )
    if not created:
        link.sentry_issue_id = sentry_issue_id
        link.mapping = mapping
        link.save(update_fields=["sentry_issue_id", "mapping", "updated_at"])

    plane_issue.external_source = "sentry"
    plane_issue.external_id = sentry_issue_id
    plane_issue.save(update_fields=["external_source", "external_id", "updated_at"])
    return link


def store_connection_tokens(
    *,
    connection: SentryWorkspaceConnection,
    access_token: str,
    refresh_token: str = "",
    org_slug: str = "",
) -> SentryWorkspaceConnection:
    connection.access_token_encrypted = encrypt_data(access_token)
    if refresh_token:
        connection.refresh_token_encrypted = encrypt_data(refresh_token)
    if org_slug:
        connection.sentry_org_slug = org_slug
    connection.save(
        update_fields=[
            "access_token_encrypted",
            "refresh_token_encrypted",
            "sentry_org_slug",
            "updated_at",
        ]
    )
    return connection
