from django.conf import settings
from django.db import models
from django.db.models import Q, UniqueConstraint

from .base import BaseModel


class AgentConfiguration(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_configurations",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="agent_configurations",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=50, default="openai")
    api_key_encrypted = models.TextField(blank=True, default="")
    model = models.CharField(max_length=100, default="gpt-5.5")
    max_steps = models.PositiveSmallIntegerField(default=25)
    reasoning_level = models.CharField(max_length=20, default="medium")
    is_enabled = models.BooleanField(default=True)
    system_prompt = models.TextField(blank=True, default="")

    class Meta:
        db_table = "agent_configurations"
        unique_together = [["workspace", "project"]]
        constraints = [
            UniqueConstraint(
                fields=["workspace"],
                condition=Q(project__isnull=True),
                name="agent_config_unique_workspace_when_no_project",
            )
        ]


class AgentChatSession(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_sessions",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.SET_NULL,
        related_name="agent_sessions",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_sessions",
    )
    title = models.CharField(max_length=255, blank=True, default="")
    selected_model = models.CharField(max_length=100, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "agent_chat_sessions"
        ordering = ("-created_at",)


class AgentChatMessage(BaseModel):
    ROLE_CHOICES = [
        ("user", "User"),
        ("assistant", "Assistant"),
        ("tool", "Tool"),
    ]

    session = models.ForeignKey(
        "db.AgentChatSession",
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField(blank=True, default="")
    tool_calls = models.JSONField(null=True, blank=True)
    tool_call_id = models.CharField(max_length=255, blank=True, default="")
    tool_name = models.CharField(max_length=100, blank=True, default="")
    tool_input = models.JSONField(null=True, blank=True)
    tool_output = models.JSONField(null=True, blank=True)
    model_used = models.CharField(max_length=100, blank=True, default="")
    tokens_sent = models.PositiveIntegerField(default=0)
    tokens_received = models.PositiveIntegerField(default=0)
    reasoning_tokens = models.PositiveIntegerField(default=0)
    step_index = models.PositiveSmallIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    is_error = models.BooleanField(default=False)

    class Meta:
        db_table = "agent_chat_messages"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["session", "created_at"]),
        ]
