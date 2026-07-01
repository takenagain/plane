from django.urls import path

from plane.agent.views import (
    AgentChatView,
    AgentSessionDetailView,
    AgentSessionListCreateView,
    EffectiveAgentConfigView,
    ProjectAgentConfigView,
    WorkspaceAgentConfigView,
)

urlpatterns = [
    path("workspaces/<str:slug>/agent/config/", WorkspaceAgentConfigView.as_view(), name="agent-workspace-config"),
    path(
        "workspaces/<str:slug>/agent/effective-config/",
        EffectiveAgentConfigView.as_view(),
        name="agent-effective-config",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/agent/config/",
        ProjectAgentConfigView.as_view(),
        name="agent-project-config",
    ),
    path("workspaces/<str:slug>/agent/sessions/", AgentSessionListCreateView.as_view(), name="agent-sessions"),
    path(
        "workspaces/<str:slug>/agent/sessions/<uuid:session_id>/",
        AgentSessionDetailView.as_view(),
        name="agent-session-detail",
    ),
    path(
        "workspaces/<str:slug>/agent/sessions/<uuid:session_id>/chat/",
        AgentChatView.as_view(),
        name="agent-chat",
    ),
]
