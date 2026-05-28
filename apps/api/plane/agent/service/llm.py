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

        provider="openai",    model="gpt-5.5"
        provider="anthropic", model="claude-sonnet-4-6"
        provider="gemini",    model="gemini-3.5-flash"
        provider="mistral",   model="mistral-small-4"

    See https://docs.mozilla.ai/any-llm/providers/ for all supported provider IDs.
    """
    # AnyLLM.create() is the production-recommended approach — reuses
    # the underlying provider SDK client for connection pooling.
    llm = AnyLLM.create(provider, api_key=api_key)
    start = time.monotonic()

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "timeout": 30,
    }

    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    # Provider-specific reasoning parameters
    if provider == "openai" and (
        model.startswith("gpt-5") or any(model.startswith(p) for p in ("o1", "o3", "o4"))
    ):
        if reasoning_level != "none":
            kwargs["reasoning_effort"] = reasoning_level

    elif provider == "anthropic":
        kwargs["max_tokens"] = 8192
        if reasoning_level == "high":
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": 8000}

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
