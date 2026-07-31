# service/llm.py
import time
from dataclasses import dataclass, field

from any_llm import AnyLLM
from any_llm.exceptions import (
    AuthenticationError,
    ContextLengthExceededError,
    MissingApiKeyError,
    ProviderError,
    RateLimitError,
)

from plane.agent.catalog import get_model
from plane.utils.exception_logger import log_exception


@dataclass
class LLMResponse:
    content: str
    tool_calls: list = field(default_factory=list)
    tokens_sent: int = 0
    tokens_received: int = 0
    reasoning_tokens: int = 0
    latency_ms: int = 0
    finish_reason: str = "stop"


def _build_completion_kwargs(
    *,
    messages: list[dict],
    tools: list[dict],
    provider: str,
    model: str,
    reasoning_level: str,
) -> dict:
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "timeout": 30,
    }

    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    if provider == "openai" and (
        model.startswith("gpt-5") or any(model.startswith(prefix) for prefix in ("o1", "o3", "o4"))
    ):
        if reasoning_level != "none":
            kwargs["reasoning_effort"] = reasoning_level

    elif provider == "anthropic":
        kwargs["max_tokens"] = 8192
        model_definition = get_model(provider, model)
        reasoning_mode = model_definition.reasoning_mode if model_definition else "none"

        if reasoning_level != "none" and reasoning_mode == "adaptive":
            kwargs["thinking"] = {"type": "adaptive"}
            kwargs["output_config"] = {"effort": reasoning_level}
        elif reasoning_level != "none" and reasoning_mode == "manual":
            budget_by_level = {
                "low": 1024,
                "medium": 4096,
                "high": 8000,
            }
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": budget_by_level.get(reasoning_level, 4096),
            }

    return kwargs


def call_llm(
    *,
    messages: list[dict],
    tools: list[dict],
    provider: str,
    model: str,
    api_key: str,
    reasoning_level: str = "medium",
) -> LLMResponse:
    """
    Single entry-point for all LLM calls across every provider.

    Uses AnyLLM (mozilla-ai/any-llm) which wraps each provider's official SDK.
    The `provider` and `model` fields from AgentConfiguration map directly —
    no string concatenation required:

        provider="openai",    model="gpt-5.6-sol"
        provider="anthropic", model="claude-sonnet-5"
        provider="gemini",    model="gemini-3.6-flash"
        provider="mistral",   model="mistral-small-2603"

    See https://docs.mozilla.ai/any-llm/providers/ for all supported provider IDs.
    """
    # AnyLLM.create() is the production-recommended approach — reuses
    # the underlying provider SDK client for connection pooling.
    llm = AnyLLM.create(provider, api_key=api_key)
    start = time.monotonic()

    kwargs = _build_completion_kwargs(
        messages=messages,
        tools=tools,
        provider=provider,
        model=model,
        reasoning_level=reasoning_level,
    )

    try:
        response = llm.completion(**kwargs)
    except (AuthenticationError, MissingApiKeyError) as exc:
        raise ValueError(f"Invalid or missing API key for provider '{provider}'.") from exc
    except RateLimitError as exc:
        raise ValueError(f"Rate limit exceeded for provider '{provider}'.") from exc
    except ContextLengthExceededError as exc:
        raise ValueError(f"Context length exceeded for provider '{provider}'.") from exc
    except ProviderError as exc:
        raise ValueError(f"Provider error from '{provider}': {exc}") from exc
    except Exception as exc:
        log_exception(exc)
        raise

    elapsed = int((time.monotonic() - start) * 1000)
    choice = response.choices[0]
    usage = response.usage

    # Normalise tool_calls to plain dicts for DB serialisation
    tool_calls = []
    if choice.message.tool_calls:
        for tc in choice.message.tool_calls:
            tool_calls.append(
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
            )

    reasoning_tokens = 0
    if usage:
        details = getattr(usage, "completion_tokens_details", None)
        reasoning_tokens = getattr(details, "reasoning_tokens", 0) or 0

    return LLMResponse(
        content=choice.message.content or "",
        tool_calls=tool_calls,
        tokens_sent=getattr(usage, "prompt_tokens", 0),
        tokens_received=getattr(usage, "completion_tokens", 0),
        reasoning_tokens=reasoning_tokens,
        latency_ms=elapsed,
        finish_reason=choice.finish_reason or "stop",
    )
