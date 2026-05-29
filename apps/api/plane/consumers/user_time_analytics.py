import json
from uuid import UUID

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from plane.db.models import Workspace, WorkspaceMember
from plane.utils.user_time_analytics import target_user_in_workspace
from plane.utils.worklog_realtime import user_time_analytics_group_name


class UserTimeAnalyticsConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.slug = self.scope["url_route"]["kwargs"]["slug"]
        self.user_id = self.scope["url_route"]["kwargs"]["user_id"]
        user = self.scope.get("user")

        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return

        try:
            target_uuid = UUID(str(self.user_id))
        except (ValueError, TypeError):
            await self.close(code=4400)
            return

        workspace = await self._get_workspace(self.slug)
        if workspace is None:
            await self.close(code=4404)
            return

        is_member = await self._is_workspace_member(workspace.id, user.id)
        if not is_member:
            await self.close(code=4403)
            return

        if not await database_sync_to_async(target_user_in_workspace)(self.slug, target_uuid):
            await self.close(code=4404)
            return

        self.group_name = user_time_analytics_group_name(workspace.id, target_uuid)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def worklog_timer_event(self, event):
        await self.send(text_data=json.dumps(event.get("payload", {})))

    @staticmethod
    async def _get_workspace(slug):
        return await Workspace.objects.filter(slug=slug).afirst()

    @staticmethod
    async def _is_workspace_member(workspace_id, member_id):
        return await WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            member_id=member_id,
            is_active=True,
        ).aexists()
