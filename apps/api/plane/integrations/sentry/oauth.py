import secrets
from urllib.parse import urlencode

import requests

from plane.integrations.sentry.config import get_sentry_api_base, get_sentry_config


SENTRY_SCOPES = "project:read org:read event:read event:write"


def build_authorization_url(*, redirect_uri: str, state: str) -> str:
    client_id, _, _, _, _ = get_sentry_config()
    api_base = get_sentry_api_base()
    params = {
        "client_id": client_id,
        "response_type": "code",
        "scope": SENTRY_SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return f"{api_base}/oauth/authorize/?{urlencode(params)}"


def exchange_code_for_token(*, code: str, redirect_uri: str) -> dict:
    client_id, client_secret, _, _, _ = get_sentry_config()
    api_base = get_sentry_api_base()
    response = requests.post(
        f"{api_base}/oauth/token/",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def fetch_org_slug(access_token: str) -> str:
    api_base = get_sentry_api_base()
    response = requests.get(
        f"{api_base}/api/0/organizations/",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    response.raise_for_status()
    organizations = response.json()
    if not organizations:
        return "unknown"
    return organizations[0].get("slug", "unknown")


def generate_oauth_state(workspace_slug: str) -> str:
    return f"{workspace_slug}:{secrets.token_urlsafe(16)}"
