import os

from plane.license.utils.instance_value import get_configuration_value


def is_github_sync_enabled() -> bool:
    (enabled,) = get_configuration_value(
        [{"key": "ENABLE_GITHUB_SYNC", "default": os.environ.get("ENABLE_GITHUB_SYNC", "0")}]
    )
    return str(enabled) == "1"


def get_github_app_credentials():
    return get_configuration_value(
        [
            {"key": "GITHUB_APP_ID", "default": os.environ.get("GITHUB_APP_ID", "")},
            {"key": "GITHUB_PRIVATE_KEY", "default": os.environ.get("GITHUB_PRIVATE_KEY", "")},
            {"key": "GITHUB_WEBHOOK_SECRET", "default": os.environ.get("GITHUB_WEBHOOK_SECRET", "")},
        ]
    )
