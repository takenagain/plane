from dataclasses import replace

import pytest
from rest_framework import status

from plane.agent.catalog import MODEL_CATALOG, ModelDefinition
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

    def test_accepts_luna_with_reasoning_and_agent_tools(self, session_client, workspace):
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

        assert response.status_code == status.HTTP_200_OK
        assert response.data["model"] == "gpt-5.6-luna"
        assert response.data["reasoning_level"] == "medium"
        assert AgentConfiguration.objects.filter(workspace=workspace, project__isnull=True).exists()

    def test_rejects_reasoning_for_model_that_cannot_use_agent_tools(self, monkeypatch, session_client, workspace):
        unsupported_model = ModelDefinition(
            id="unsupported-reasoning-tools-model",
            name="Unsupported reasoning/tools model",
            input_price=0,
            output_price=0,
            supports_reasoning_with_tools=False,
        )
        monkeypatch.setitem(
            MODEL_CATALOG,
            "openai",
            replace(MODEL_CATALOG["openai"], models=(*MODEL_CATALOG["openai"].models, unsupported_model)),
        )
        url = f"/api/workspaces/{workspace.slug}/agent/config/"

        response = session_client.post(
            url,
            {
                "api_key": "sk-test-key",
                "provider": "openai",
                "model": unsupported_model.id,
                "reasoning_level": "medium",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["reasoning_level"] == [
            "Unsupported reasoning/tools model does not support reasoning together with the function tools used by "
            "Plane. Set Reasoning to none or choose another model."
        ]
        assert not AgentConfiguration.objects.filter(workspace=workspace, project__isnull=True).exists()

    def test_accepts_unsupported_tools_model_when_reasoning_is_disabled(
        self, monkeypatch, session_client, workspace
    ):
        unsupported_model = ModelDefinition(
            id="unsupported-reasoning-tools-model",
            name="Unsupported reasoning/tools model",
            input_price=0,
            output_price=0,
            supports_reasoning_with_tools=False,
        )
        monkeypatch.setitem(
            MODEL_CATALOG,
            "openai",
            replace(MODEL_CATALOG["openai"], models=(*MODEL_CATALOG["openai"].models, unsupported_model)),
        )
        url = f"/api/workspaces/{workspace.slug}/agent/config/"

        response = session_client.post(
            url,
            {
                "api_key": "sk-test-key",
                "provider": "openai",
                "model": unsupported_model.id,
                "reasoning_level": "none",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["model"] == unsupported_model.id
        assert response.data["reasoning_level"] == "none"
