import os

from plane.license.utils.instance_value import get_configuration_value


def get_sentry_config():
    return get_configuration_value(
        [
            {"key": "SENTRY_CLIENT_ID", "default": os.environ.get("SENTRY_CLIENT_ID")},
            {"key": "SENTRY_CLIENT_SECRET", "default": os.environ.get("SENTRY_CLIENT_SECRET")},
            {"key": "ENABLE_SENTRY_SYNC", "default": os.environ.get("ENABLE_SENTRY_SYNC", "0")},
            {"key": "SENTRY_WEBHOOK_SECRET", "default": os.environ.get("SENTRY_WEBHOOK_SECRET")},
            {"key": "SENTRY_API_BASE_URL", "default": os.environ.get("SENTRY_API_BASE_URL", "https://sentry.io")},
        ]
    )


def is_sentry_sync_enabled() -> bool:
    (_, _, enabled, _, _) = get_sentry_config()
    return enabled == "1"


def get_sentry_api_base() -> str:
    (_, _, _, _, api_base) = get_sentry_config()
    return (api_base or "https://sentry.io").rstrip("/")
