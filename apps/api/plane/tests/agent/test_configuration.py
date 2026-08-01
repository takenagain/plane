import pytest
from rest_framework import status

from plane.db.models import AgentConfiguration


@pytest.mark.unit
@pytest.mark.django_db
class TestWorkspaceAgentConfigView:
    def test_post_config_first_create_with_api_key_only(self, session_client, workspace):
        url = f"/api/workspaces/{workspace.slug}/agent/config/"
        assert not AgentConfiguration.objects.filter(workspace=workspace, project__isnull=True).exists()

        response = session_client.post(url, {"api_key": "sk-test-key"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["api_key_set"] is True
        assert AgentConfiguration.objects.filter(workspace=workspace, project__isnull=True).exists()

    def test_rejects_model_reasoning_combination_that_cannot_use_agent_tools(self, session_client, workspace):
        url = f"/api/workspaces/{workspace.slug}/agent/config/"

        response = session_client.post(
            url,
            {
                "api_key": "sk-test-key",
                "provider": "openai",
                "model": "gpt-5.6-luna",
                "reasoning_level": "medium",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["reasoning_level"] == [
            "GPT-5.6 Luna does not support reasoning together with the function tools used by Plane. "
            "Set Reasoning to none or choose another model."
        ]
        assert not AgentConfiguration.objects.filter(workspace=workspace, project__isnull=True).exists()

    def test_accepts_model_when_incompatible_reasoning_is_disabled(self, session_client, workspace):
        url = f"/api/workspaces/{workspace.slug}/agent/config/"

        response = session_client.post(
            url,
            {
                "api_key": "sk-test-key",
                "provider": "openai",
                "model": "gpt-5.6-luna",
                "reasoning_level": "none",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["model"] == "gpt-5.6-luna"
        assert response.data["reasoning_level"] == "none"
