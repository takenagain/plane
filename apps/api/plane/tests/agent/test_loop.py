from unittest.mock import patch

import pytest

from plane.agent.service.llm import LLMResponse
from plane.agent.service.loop import AgentService
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
        title="",
    )


@pytest.mark.unit
@pytest.mark.django_db
class TestAgentServiceLoop:
    @patch("plane.agent.service.loop.call_llm")
    def test_tool_calls_executed_when_finish_reason_not_tool_calls(
        self, mock_call_llm, agent_session, create_user, agent_config
    ):
        mock_call_llm.side_effect = [
            LLMResponse(
                content="",
                tool_calls=[
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "list_projects", "arguments": "{}"},
                    }
                ],
                finish_reason="stop",
            ),
            LLMResponse(content="All done.", finish_reason="stop"),
        ]

        messages = AgentService().run(
            session=agent_session,
            user_content="List projects",
            project_id=None,
            model_override=None,
            request_user=create_user,
        )

        tool_msgs = [message for message in messages if message.role == "tool"]
        assert len(tool_msgs) == 1
        assert tool_msgs[0].tool_name == "list_projects"
        assert mock_call_llm.call_count == 2
