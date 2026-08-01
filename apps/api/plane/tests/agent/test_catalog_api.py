import pytest
from rest_framework import status

from plane.db.models import AgentConfiguration


@pytest.mark.unit
@pytest.mark.django_db
class TestAgentProviderCatalogView:
    def test_returns_current_provider_catalog_to_workspace_members(self, session_client, workspace):
        response = session_client.get(f"/api/workspaces/{workspace.slug}/agent/providers/")

        assert response.status_code == status.HTTP_200_OK
        assert [provider["id"] for provider in response.data] == [
            "openai",
            "anthropic",
            "gemini",
            "mistral",
        ]
        assert response.data[0]["default_model"] == "gpt-5.6-sol"
        assert response.data[0]["models"][0]["name"] == "GPT-5.6 Sol"


@pytest.mark.unit
@pytest.mark.django_db
class TestAgentCatalogConfiguration:
    def test_config_response_includes_string_and_rich_model_lists(self, session_client, workspace):
        AgentConfiguration.objects.create(
            workspace=workspace,
            provider="openai",
            model="gpt-5.6-sol",
        )

        response = session_client.get(f"/api/workspaces/{workspace.slug}/agent/config/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["available_models"][0] == "gpt-5.6-sol"
        assert response.data["available_model_details"][0] == {
            "id": "gpt-5.6-sol",
            "name": "GPT-5.6 Sol",
            "lifecycle": "stable",
            "input_price": 5,
            "output_price": 30,
            "pricing_note": "",
            "supports_reasoning_with_tools": True,
        }

    def test_rejects_model_outside_selected_provider(self, session_client, workspace):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/agent/config/",
            {
                "api_key": "sk-test-key",
                "provider": "anthropic",
                "model": "gpt-5.6-sol",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["model"] == ["Model is not supported by anthropic."]

    @pytest.mark.parametrize(
        ("provider", "expected_model"),
        [
            ("openai", "gpt-5.6-sol"),
            ("anthropic", "claude-sonnet-5"),
            ("gemini", "gemini-3.6-flash"),
            ("mistral", "mistral-small-2603"),
        ],
    )
    def test_create_without_model_uses_provider_default(
        self,
        session_client,
        workspace,
        provider,
        expected_model,
    ):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/agent/config/",
            {
                "api_key": "test-provider-key",
                "provider": provider,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["model"] == expected_model
        assert response.data["default_model"] == expected_model
