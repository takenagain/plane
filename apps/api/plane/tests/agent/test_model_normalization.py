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
        reasoning_level="none",
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


@pytest.mark.unit
@pytest.mark.django_db
@patch("plane.agent.service.loop.call_llm")
def test_runtime_allows_luna_override_with_reasoning_and_tools(
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
        reasoning_level="medium",
        is_enabled=True,
    )
    session = AgentChatSession.objects.create(
        workspace=workspace,
        user=create_user,
        title="",
    )
    mock_call_llm.return_value = LLMResponse(content="Done.", finish_reason="stop")

    messages = AgentService().run(
        session=session,
        user_content="Use the selected model",
        project_id=None,
        model_override="gpt-5.6-luna",
        request_user=create_user,
    )

    mock_call_llm.assert_called_once()
    assert mock_call_llm.call_args.kwargs["model"] == "gpt-5.6-luna"
    assert mock_call_llm.call_args.kwargs["reasoning_level"] == "medium"
    assert mock_call_llm.call_args.kwargs["tools"]
    assert len(messages) == 2
    assert messages[-1].is_error is False
    assert messages[-1].content == "Done."


@pytest.mark.unit
@pytest.mark.django_db
@patch("plane.agent.service.loop.call_llm")
def test_runtime_allows_existing_luna_configuration_with_reasoning_and_tools(
    mock_call_llm,
    db,
    workspace,
    create_user,
):
    AgentConfiguration.objects.create(
        workspace=workspace,
        provider="openai",
        api_key_encrypted=encrypt_data("sk-test-key"),
        model="gpt-5.6-luna",
        reasoning_level="medium",
        is_enabled=True,
    )
    session = AgentChatSession.objects.create(
        workspace=workspace,
        user=create_user,
        title="",
    )
    mock_call_llm.return_value = LLMResponse(content="Done.", finish_reason="stop")

    messages = AgentService().run(
        session=session,
        user_content="Use the configured model",
        project_id=None,
        model_override=None,
        request_user=create_user,
    )

    mock_call_llm.assert_called_once()
    assert mock_call_llm.call_args.kwargs["model"] == "gpt-5.6-luna"
    assert mock_call_llm.call_args.kwargs["reasoning_level"] == "medium"
    assert mock_call_llm.call_args.kwargs["tools"]
    assert len(messages) == 2
    assert messages[-1].is_error is False
    assert messages[-1].content == "Done."
