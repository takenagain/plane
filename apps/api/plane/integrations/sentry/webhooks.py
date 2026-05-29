import hashlib
import hmac

from plane.db.models import SentryWorkspaceConnection, Workspace
from plane.integrations.sentry.config import get_sentry_config
from plane.integrations.sentry.sync import extract_issue_payload, handle_alert_webhook
from plane.license.utils.encryption import decrypt_data


def verify_sentry_signature(*, body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    provided = signature_header.replace("sha256=", "").strip()
    return hmac.compare_digest(expected, provided)


def resolve_webhook_secret(connection: SentryWorkspaceConnection | None) -> str:
    if connection and connection.webhook_secret:
        return connection.webhook_secret

    _, _, _, instance_secret, _ = get_sentry_config()
    if instance_secret:
        decrypted = decrypt_data(instance_secret)
        return decrypted or instance_secret
    return ""


def process_sentry_webhook(*, workspace_slug: str, body: bytes, payload: dict, signature: str | None) -> dict:
    workspace = Workspace.objects.filter(slug=workspace_slug).first()
    if not workspace:
        raise LookupError("Workspace not found")

    connection = SentryWorkspaceConnection.objects.filter(workspace_id=workspace.id).first()
    secret = resolve_webhook_secret(connection)
    if secret and not verify_sentry_signature(body=body, signature_header=signature, secret=secret):
        raise PermissionError("Invalid Sentry webhook signature")

    if not connection:
        raise LookupError("Sentry is not connected for this workspace")

    _, project_slug = extract_issue_payload(payload)

    issue = handle_alert_webhook(connection=connection, payload=payload, project_slug=project_slug)
    return {"issue_id": str(issue.id), "created": True}
