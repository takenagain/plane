from unittest.mock import patch

import pytest

from plane.agent.service.llm import LLMResponse
from plane.agent.service.loop import AgentService
from plane.db.models import AgentChatSession, AgentConfiguration
from plane.license.utils.encryption import encrypt_data


@pytest.mark.unit
@pytest.mark.django_db
@patch("plane.agent.service.loop.call_llm")
def test_obsolete_model_override_is_normalized(
    mock_call_llm,
    db,
    workspace,
    create_user,
):
    AgentConfiguration.objects.create(
        workspace=workspace,
        provider="openai",
        api_key_encrypted=encrypt_data("sk-test-key"),
        model="gpt-5.5",
        is_enabled=True,
    )
    session = AgentChatSession.objects.create(
        workspace=workspace,
        user=create_user,
        title="",
    )
    mock_call_llm.return_value = LLMResponse(content="Done.", finish_reason="stop")

    AgentService().run(
        session=session,
        user_content="Use the selected model",
        project_id=None,
        model_override="gpt-4o-mini",
        request_user=create_user,
    )

    assert mock_call_llm.call_args.kwargs["model"] == "gpt-5.6-luna"
    session.refresh_from_db()
    assert session.selected_model == "gpt-5.6-luna"
