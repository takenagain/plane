import pytest

from plane.agent.catalog import (
    MODEL_CATALOG,
    get_default_model,
    get_model,
    get_public_catalog,
    normalize_model,
)


@pytest.mark.unit
class TestAgentModelCatalog:
    def test_exposes_current_openai_models_in_recommended_order(self):
        assert [model.id for model in MODEL_CATALOG["openai"].models] == [
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
            "gpt-5.5",
        ]

    def test_uses_current_provider_defaults(self):
        assert get_default_model("openai") == "gpt-5.6-sol"
        assert get_default_model("anthropic") == "claude-sonnet-5"
        assert get_default_model("gemini") == "gemini-3.6-flash"
        assert get_default_model("mistral") == "mistral-small-2603"

    def test_exposes_price_and_lifecycle_metadata(self):
        opus = get_model("anthropic", "claude-opus-4-8")
        assert opus is not None
        assert opus.lifecycle == "previous"
        assert opus.input_price == 5
        assert opus.output_price == 25

        gemini = get_model("gemini", "gemini-3.1-pro-preview")
        assert gemini is not None
        assert gemini.lifecycle == "preview"
        assert "above 200k" in gemini.pricing_note

    def test_exposes_reasoning_with_tools_capability(self):
        luna = get_model("openai", "gpt-5.6-luna")
        sol = get_model("openai", "gpt-5.6-sol")

        assert luna is not None
        assert luna.supports_reasoning_with_tools is False
        assert sol is not None
        assert sol.supports_reasoning_with_tools is True

    def test_excludes_deprecated_models(self):
        assert get_model("anthropic", "claude-opus-4-7") is None
        assert get_model("mistral", "mistral-small-2506") is None
        assert get_model("gemini", "gemini-3-flash-preview") is None

    def test_normalizes_known_obsolete_ids_and_defaults_unknown_ids(self):
        assert normalize_model("openai", "gpt-5.5-mini") == "gpt-5.6-terra"
        assert normalize_model("openai", "gpt-5.5-nano") == "gpt-5.6-luna"
        assert normalize_model("mistral", "mistral-small-4") == "mistral-small-2603"
        assert normalize_model("anthropic", "unknown") == "claude-sonnet-5"

    def test_public_catalog_omits_internal_runtime_metadata(self):
        catalog = get_public_catalog()

        assert [provider["id"] for provider in catalog] == [
            "openai",
            "anthropic",
            "gemini",
            "mistral",
        ]
        assert catalog[0]["models"][0] == {
            "id": "gpt-5.6-sol",
            "name": "GPT-5.6 Sol",
            "lifecycle": "stable",
            "input_price": 5,
            "output_price": 30,
            "pricing_note": "",
            "supports_reasoning_with_tools": True,
        }
