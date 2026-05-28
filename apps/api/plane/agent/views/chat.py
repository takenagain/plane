from rest_framework import status
from rest_framework.response import Response

from plane.db.models import AgentChatSession

from ..serializers import AgentChatMessageSerializer
from ..service.loop import AgentDisabledError, AgentService
from .base import AgentBaseView


class AgentChatView(AgentBaseView):
    def post(self, request, slug, session_id):
        self.check_workspace_member(slug, request.user)
        session = AgentChatSession.objects.filter(id=session_id, workspace__slug=slug, is_active=True).first()
        if not session or session.user_id != request.user.id:
            return Response({"error": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

        content = (request.data.get("content") or "").strip()
        if not content:
            return Response({"error": "Message content is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_messages = AgentService().run(
                session=session,
                user_content=content,
                project_id=request.data.get("project_id"),
                model_override=request.data.get("model"),
                request_user=request.user,
            )
        except AgentDisabledError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "session_id": str(session.id),
                "messages": AgentChatMessageSerializer(new_messages, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
