from plane.db.models import Integration

INTEGRATION_CATALOG = [
    {
        "provider": "github",
        "title": "GitHub",
        "author": "Plane",
        "description": {"short": "Sync GitHub issues with Plane work items."},
        "network": 2,
        "verified": True,
        "avatar_url": None,
        "metadata": {},
    },
    {
        "provider": "slack",
        "title": "Slack",
        "author": "Plane",
        "description": {"short": "Send Plane notifications to Slack channels."},
        "network": 2,
        "verified": True,
        "avatar_url": None,
        "metadata": {},
    },
    {
        "provider": "sentry",
        "title": "Sentry",
        "author": "Plane",
        "description": {"short": "Connect your Sentry workspace with Plane."},
        "network": 2,
        "verified": True,
        "avatar_url": None,
        "metadata": {},
    },
]


def ensure_integration_catalog() -> None:
    for entry in INTEGRATION_CATALOG:
        Integration.objects.get_or_create(
            provider=entry["provider"],
            defaults={
                "title": entry["title"],
                "author": entry["author"],
                "description": entry["description"],
                "network": entry["network"],
                "verified": entry["verified"],
                "avatar_url": entry["avatar_url"],
                "metadata": entry["metadata"],
            },
        )
