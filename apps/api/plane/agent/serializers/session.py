from rest_framework import serializers

from plane.db.models import AgentChatSession


class AgentChatSessionSerializer(serializers.ModelSerializer):
    last_message_preview = serializers.SerializerMethodField()

    class Meta:
        model = AgentChatSession
        fields = "__all__"

    def get_last_message_preview(self, instance: AgentChatSession) -> str:
        last_assistant = (
            instance.messages.filter(role="assistant").exclude(content="").order_by("-created_at").only("content").first()
        )
        if not last_assistant:
            return ""
        return last_assistant.content[:80]
