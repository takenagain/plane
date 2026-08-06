from unittest.mock import patch

import pytest

from plane.agent.service.llm import _build_completion_kwargs, call_llm


@pytest.mark.unit
class TestBuildCompletionKwargs:
    def test_uses_adaptive_thinking_for_current_anthropic_models(self):
        tools = [{"type": "function", "function": {"name": "search", "parameters": {}}}]
        kwargs = _build_completion_kwargs(
            messages=[],
            tools=tools,
            provider="anthropic",
            model="claude-opus-5",
            reasoning_level="high",
        )

        assert kwargs["thinking"] == {"type": "adaptive"}
        assert kwargs["output_config"] == {"effort": "high"}
        assert kwargs["max_tokens"] == 8192
        assert kwargs["tools"] == tools
        assert kwargs["tool_choice"] == "auto"
        assert "temperature" not in kwargs

    def test_uses_manual_thinking_for_previous_anthropic_models(self):
        kwargs = _build_completion_kwargs(
            messages=[],
            tools=[],
            provider="anthropic",
            model="claude-haiku-4-5-20251001",
            reasoning_level="high",
        )

        assert kwargs["thinking"] == {"type": "enabled", "budget_tokens": 8000}
        assert "output_config" not in kwargs

    def test_does_not_enable_thinking_when_reasoning_is_disabled(self):
        kwargs = _build_completion_kwargs(
            messages=[],
            tools=[],
            provider="anthropic",
            model="claude-opus-5",
            reasoning_level="none",
        )

        assert "thinking" not in kwargs
        assert "output_config" not in kwargs

    def test_combines_openai_reasoning_with_tools_without_temperature(self):
        tools = [{"type": "function", "function": {"name": "search", "parameters": {}}}]
        kwargs = _build_completion_kwargs(
            messages=[],
            tools=tools,
            provider="openai",
            model="gpt-5.6-luna",
            reasoning_level="medium",
        )

        assert kwargs["reasoning_effort"] == "medium"
        assert kwargs["tools"] == tools
        assert kwargs["tool_choice"] == "auto"
        assert "temperature" not in kwargs

    @patch("plane.agent.service.llm.AnyLLM.create")
    def test_normalizes_raw_provider_errors_without_exposing_the_api_key(self, mock_create):
        mock_create.return_value.completion.side_effect = RuntimeError(
            "request rejected for key sk-secret\ninvalid reasoning"
        )

        with pytest.raises(ValueError) as exc_info:
            call_llm(
                messages=[],
                tools=[],
                provider="openai",
                model="gpt-5.6-luna",
                api_key="sk-secret",
                reasoning_level="medium",
            )

        assert (
            str(exc_info.value) == "Provider error from 'openai': request rejected for key [redacted] invalid reasoning"
        )
