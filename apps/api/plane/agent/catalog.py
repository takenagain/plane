from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class ModelDefinition:
    id: str
    name: str
    input_price: float
    output_price: float
    lifecycle: str = "stable"
    pricing_note: str = ""
    reasoning_mode: str = "none"
    supports_reasoning_with_tools: bool = True

    def to_public_dict(self) -> dict:
        data = asdict(self)
        data.pop("reasoning_mode")
        return data


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    name: str
    default_model: str
    models: tuple[ModelDefinition, ...]

    def to_public_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "default_model": self.default_model,
            "models": [model.to_public_dict() for model in self.models],
        }


MODEL_CATALOG: dict[str, ProviderDefinition] = {
    "openai": ProviderDefinition(
        id="openai",
        name="OpenAI",
        default_model="gpt-5.6-sol",
        models=(
            ModelDefinition(id="gpt-5.6-sol", name="GPT-5.6 Sol", input_price=5, output_price=30),
            ModelDefinition(id="gpt-5.6-terra", name="GPT-5.6 Terra", input_price=2, output_price=12),
            ModelDefinition(
                id="gpt-5.6-luna",
                name="GPT-5.6 Luna",
                input_price=0.2,
                output_price=1.2,
                supports_reasoning_with_tools=False,
            ),
            ModelDefinition(
                id="gpt-5.5",
                name="GPT-5.5",
                input_price=5,
                output_price=30,
                lifecycle="previous",
            ),
        ),
    ),
    "anthropic": ProviderDefinition(
        id="anthropic",
        name="Anthropic",
        default_model="claude-sonnet-5",
        models=(
            ModelDefinition(
                id="claude-fable-5",
                name="Claude Fable 5",
                input_price=10,
                output_price=50,
                reasoning_mode="adaptive",
            ),
            ModelDefinition(
                id="claude-opus-5",
                name="Claude Opus 5",
                input_price=5,
                output_price=25,
                reasoning_mode="adaptive",
            ),
            ModelDefinition(
                id="claude-opus-4-8",
                name="Claude Opus 4.8",
                input_price=5,
                output_price=25,
                lifecycle="previous",
                reasoning_mode="adaptive",
            ),
            ModelDefinition(
                id="claude-sonnet-5",
                name="Claude Sonnet 5",
                input_price=2,
                output_price=10,
                pricing_note="Introductory pricing through August 31, 2026; then $3 in · $15 out / 1M.",
                reasoning_mode="adaptive",
            ),
            ModelDefinition(
                id="claude-sonnet-4-6",
                name="Claude Sonnet 4.6",
                input_price=3,
                output_price=15,
                lifecycle="previous",
                reasoning_mode="manual",
            ),
            ModelDefinition(
                id="claude-haiku-4-5-20251001",
                name="Claude Haiku 4.5",
                input_price=1,
                output_price=5,
                reasoning_mode="manual",
            ),
        ),
    ),
    "gemini": ProviderDefinition(
        id="gemini",
        name="Gemini",
        default_model="gemini-3.6-flash",
        models=(
            ModelDefinition(
                id="gemini-3.1-pro-preview",
                name="Gemini 3.1 Pro",
                input_price=2,
                output_price=12,
                lifecycle="preview",
                pricing_note="$4 in · $18 out / 1M for prompts above 200k tokens.",
            ),
            ModelDefinition(
                id="gemini-2.5-pro",
                name="Gemini 2.5 Pro",
                input_price=1.25,
                output_price=10,
                lifecycle="previous",
                pricing_note="$2.50 in · $15 out / 1M for prompts above 200k tokens.",
            ),
            ModelDefinition(
                id="gemini-3.6-flash",
                name="Gemini 3.6 Flash",
                input_price=1.5,
                output_price=7.5,
            ),
            ModelDefinition(
                id="gemini-3.5-flash",
                name="Gemini 3.5 Flash",
                input_price=1.5,
                output_price=9,
                lifecycle="previous",
            ),
            ModelDefinition(
                id="gemini-3.5-flash-lite",
                name="Gemini 3.5 Flash-Lite",
                input_price=0.3,
                output_price=2.5,
            ),
            ModelDefinition(
                id="gemini-3.1-flash-lite",
                name="Gemini 3.1 Flash-Lite",
                input_price=0.25,
                output_price=1.5,
                lifecycle="previous",
            ),
        ),
    ),
    "mistral": ProviderDefinition(
        id="mistral",
        name="Mistral",
        default_model="mistral-small-2603",
        models=(
            ModelDefinition(
                id="mistral-medium-3-5",
                name="Mistral Medium 3.5",
                input_price=1.5,
                output_price=7.5,
                lifecycle="preview",
            ),
            ModelDefinition(
                id="mistral-small-2603",
                name="Mistral Small 4",
                input_price=0.15,
                output_price=0.6,
            ),
            ModelDefinition(
                id="mistral-large-2512",
                name="Mistral Large 3",
                input_price=0.5,
                output_price=1.5,
            ),
        ),
    ),
}


OBSOLETE_MODEL_REPLACEMENTS: dict[str, dict[str, str]] = {
    "openai": {
        "gpt-4o-mini": "gpt-5.6-luna",
        "gpt-5.5-mini": "gpt-5.6-terra",
        "gpt-5.5-nano": "gpt-5.6-luna",
        "gpt-5.5-pro": "gpt-5.6-sol",
    },
    "anthropic": {
        "claude-opus-4-7": "claude-opus-4-8",
    },
    "gemini": {
        "gemini-3-flash-preview": "gemini-3.6-flash",
        "gemini-3.1-flash-lite-preview": "gemini-3.5-flash-lite",
        "gemini-2.0-flash": "gemini-3.6-flash",
        "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    },
    "mistral": {
        "mistral-medium-3.5": "mistral-medium-3-5",
        "mistral-small-4": "mistral-small-2603",
        "mistral-large-3-2512": "mistral-large-2512",
    },
}


def get_provider(provider: str) -> ProviderDefinition | None:
    return MODEL_CATALOG.get(provider)


def get_model(provider: str, model_id: str) -> ModelDefinition | None:
    definition = get_provider(provider)
    if not definition:
        return None
    return next((model for model in definition.models if model.id == model_id), None)


def get_default_model(provider: str) -> str:
    definition = get_provider(provider)
    return definition.default_model if definition else MODEL_CATALOG["openai"].default_model


def get_public_catalog() -> list[dict]:
    return [provider.to_public_dict() for provider in MODEL_CATALOG.values()]


def get_model_configuration_error(provider: str, model_id: str, reasoning_level: str) -> str | None:
    model = get_model(provider, model_id)
    if not model or reasoning_level == "none" or model.supports_reasoning_with_tools:
        return None

    return (
        f"{model.name} does not support reasoning together with the function tools used by Plane. "
        "Set Reasoning to none or choose another model."
    )


def normalize_model(provider: str, model_id: str | None) -> str:
    if model_id and get_model(provider, model_id):
        return model_id
    if model_id:
        replacement = OBSOLETE_MODEL_REPLACEMENTS.get(provider, {}).get(model_id)
        if replacement:
            return replacement
    return get_default_model(provider)
