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
