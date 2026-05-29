from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def user_time_analytics_group_name(workspace_id: UUID, target_user_id: UUID) -> str:
    return f"user_time_analytics_{workspace_id}_{target_user_id}"


def broadcast_worklog_timer_event(
    workspace_id: UUID,
    target_user_id: UUID,
    event: dict[str, Any],
) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    group = user_time_analytics_group_name(workspace_id, target_user_id)
    async_to_sync(channel_layer.group_send)(
        group,
        {
            "type": "worklog_timer_event",
            "payload": event,
        },
    )
