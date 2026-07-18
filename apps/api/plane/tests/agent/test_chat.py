from unittest.mock import patch

import pytest
from rest_framework import status

from plane.agent.service.llm import LLMResponse
from plane.db.models import AgentChatSession, AgentConfiguration
from plane.license.utils.encryption import encrypt_data


@pytest.fixture
def agent_config(db, workspace):
    return AgentConfiguration.objects.create(
        workspace=workspace,
        provider="openai",
        api_key_encrypted=encrypt_data("sk-test-key"),
        model="gpt-5.5",
        is_enabled=True,
    )


@pytest.fixture
def agent_session(db, workspace, create_user, agent_config):
    return AgentChatSession.objects.create(
        workspace=workspace,
        user=create_user,
        title="Test session",
    )


@pytest.mark.unit
@pytest.mark.django_db
class TestAgentChatView:
    def test_rejects_non_object_ui_context(self, session_client, workspace, agent_session, agent_config):
        url = f"/api/workspaces/{workspace.slug}/agent/sessions/{agent_session.id}/chat/"
        response = session_client.post(
            url,
            {"content": "Hello", "ui_context": "invalid"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "ui_context must be an object."

    @patch("plane.agent.service.loop.call_llm")
    def test_accepts_ui_context(self, mock_call_llm, session_client, workspace, agent_session, agent_config):
        mock_call_llm.return_value = LLMResponse(content="Hi there.", finish_reason="stop")

        url = f"/api/workspaces/{workspace.slug}/agent/sessions/{agent_session.id}/chat/"
        ui_context = {
            "workspace": {"slug": workspace.slug, "name": workspace.name, "id": str(workspace.id)},
            "user": {"id": "user-1", "display_name": "Test User", "email": "test@plane.so"},
            "projects": {"current_id": None, "available": []},
            "view": {"surface": "other", "layout": None},
            "open_work_item": None,
        }

        response = session_client.post(
            url,
            {"content": "Hello", "ui_context": ui_context},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_id"] == str(agent_session.id)
        assert len(response.data["messages"]) >= 2

        system_message = mock_call_llm.call_args.kwargs["messages"][0]
        assert system_message["role"] == "system"
        assert "Current context:" in system_message["content"]
        assert workspace.slug in system_message["content"]

    @patch("plane.agent.service.loop.call_llm")
    def test_ui_context_spoofed_user_overridden_by_request_user(
        self, mock_call_llm, session_client, workspace, agent_session, agent_config, create_user
    ):
        mock_call_llm.return_value = LLMResponse(content="Hi there.", finish_reason="stop")

        url = f"/api/workspaces/{workspace.slug}/agent/sessions/{agent_session.id}/chat/"
        ui_context = {
            "workspace": {"slug": "evil-workspace", "name": "Evil"},
            "user": {
                "id": "00000000-0000-0000-0000-000000000000",
                "display_name": "Spoofed User",
                "email": "spoofed@evil.com",
            },
            "projects": {"current_id": None, "available": []},
        }

        response = session_client.post(
            url,
            {"content": "Hello", "ui_context": ui_context},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        system_message = mock_call_llm.call_args.kwargs["messages"][0]
        assert str(create_user.id) in system_message["content"]
        assert create_user.email in system_message["content"]
        assert "spoofed@evil.com" not in system_message["content"]
        assert "evil-workspace" not in system_message["content"]
        assert workspace.slug in system_message["content"]

    @patch("plane.agent.views.chat.AgentService.run")
    def test_project_id_falls_back_to_ui_context_current_project(
        self, mock_run, session_client, workspace, agent_session, agent_config
    ):
        mock_run.return_value = []

        project_id = "11111111-1111-1111-1111-111111111111"
        url = f"/api/workspaces/{workspace.slug}/agent/sessions/{agent_session.id}/chat/"
        ui_context = {
            "workspace": {"slug": workspace.slug},
            "user": {"id": "user-1", "display_name": "Test User", "email": "test@plane.so"},
            "projects": {"current_id": project_id, "available": []},
            "view": {"surface": "browse", "layout": None},
            "open_work_item": {
                "presentation": "browse",
                "id": "22222222-2222-2222-2222-222222222222",
                "identifier": "PROJ-42",
                "project_id": project_id,
            },
        }

        response = session_client.post(
            url,
            {"content": "Update this issue", "project_id": None, "ui_context": ui_context},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_run.assert_called_once()
        assert mock_run.call_args.kwargs["project_id"] == project_id
