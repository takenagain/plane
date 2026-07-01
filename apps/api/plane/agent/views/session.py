from rest_framework import status
from rest_framework.response import Response

from plane.db.models import AgentChatSession, Workspace

from ..serializers import AgentChatMessageSerializer, AgentChatSessionSerializer
from .base import AgentBaseView


class AgentSessionListCreateView(AgentBaseView):
    def get(self, request, slug):
        self.check_workspace_member(slug, request.user)
        sessions = AgentChatSession.objects.filter(
            workspace__slug=slug,
            user=request.user,
            is_active=True,
        ).order_by("-created_at")
        return Response(AgentChatSessionSerializer(sessions, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug):
        self.check_workspace_member(slug, request.user)
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AgentChatSessionSerializer(
            data={
                "workspace": workspace.id,
                "project": request.data.get("project_id"),
                "user": request.user.id,
                "title": request.data.get("title", ""),
                "selected_model": request.data.get("selected_model", ""),
                "is_active": True,
            }
        )
        serializer.is_valid(raise_exception=True)
        session = serializer.save()
        return Response(AgentChatSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class AgentSessionDetailView(AgentBaseView):
    def get(self, request, slug, session_id):
        self.check_workspace_member(slug, request.user)
        session = AgentChatSession.objects.filter(id=session_id, workspace__slug=slug, is_active=True).first()
        if not session or session.user_id != request.user.id:
            return Response({"error": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

        payload = AgentChatSessionSerializer(session).data
        payload["messages"] = AgentChatMessageSerializer(session.messages.order_by("created_at"), many=True).data
        return Response(payload, status=status.HTTP_200_OK)

    def delete(self, request, slug, session_id):
        self.check_workspace_member(slug, request.user)
        session = AgentChatSession.objects.filter(id=session_id, workspace__slug=slug, is_active=True).first()
        if not session or session.user_id != request.user.id:
            return Response({"error": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

        session.is_active = False
        session.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
