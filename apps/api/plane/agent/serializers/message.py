from rest_framework import serializers

from plane.db.models import AgentChatMessage


class AgentChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentChatMessage
        fields = [
            "id",
            "session",
            "role",
            "content",
            "tool_calls",
            "tool_call_id",
            "tool_name",
            "tool_input",
            "tool_output",
            "model_used",
            "tokens_sent",
            "tokens_received",
            "reasoning_tokens",
            "step_index",
            "latency_ms",
            "is_error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = (
            "id",
            "session",
            "role",
            "content",
            "tool_calls",
            "tool_call_id",
            "tool_name",
            "tool_input",
            "tool_output",
            "model_used",
            "tokens_sent",
            "tokens_received",
            "reasoning_tokens",
            "step_index",
            "latency_ms",
            "is_error",
            "created_at",
            "updated_at",
        )
