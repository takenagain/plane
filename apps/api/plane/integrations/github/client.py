import hashlib
import hmac
import time
from typing import Any

import jwt
import requests

from plane.integrations.config import get_github_app_credentials
from plane.utils.exception_logger import log_exception


GITHUB_API = "https://api.github.com"
PLANE_SYNC_LABEL = "Plane"


def verify_webhook_signature(payload: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    try:
        algorithm, signature = signature_header.split("=", 1)
    except ValueError:
        return False
    if algorithm != "sha256":
        return False
    digest = hmac.new(secret.encode("utf-8"), msg=payload, digestmod=hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def _normalize_private_key(private_key: str) -> str:
    if not private_key:
        return ""
    if "BEGIN" in private_key:
        return private_key.replace("\\n", "\n")
    return private_key


def create_app_jwt(app_id: str, private_key: str) -> str:
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 600, "iss": app_id}
    key = _normalize_private_key(private_key)
    return jwt.encode(payload, key, algorithm="RS256")


def get_installation_access_token(installation_id: int) -> str | None:
    app_id, private_key, _ = get_github_app_credentials()
    if not app_id or not private_key:
        return None
    try:
        app_jwt = create_app_jwt(str(app_id), private_key)
        response = requests.post(
            f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("token")
    except Exception as exc:
        log_exception(exc)
        return None


def list_installation_repositories(
    installation_id: int, page: int = 1, per_page: int = 30
) -> tuple[list[dict[str, Any]], int]:
    token = get_installation_access_token(installation_id)
    if not token:
        return [], 0

    try:
        response = requests.get(
            f"{GITHUB_API}/installation/repositories",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params={"page": page, "per_page": per_page},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        repositories = payload.get("repositories", [])
        total_count = payload.get("total_count", len(repositories))
        return repositories, total_count
    except Exception as exc:
        log_exception(exc)
        return [], 0


def issue_has_plane_label(issue_payload: dict[str, Any]) -> bool:
    labels = issue_payload.get("labels", [])
    for label in labels:
        name = label.get("name") if isinstance(label, dict) else label
        if name == PLANE_SYNC_LABEL:
            return True
    return False
