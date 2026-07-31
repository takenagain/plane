# Agent Model Catalog Refresh

## Goal

Replace the stale agent model lists with a current, provider-aware catalog used by:

- the agent popup model selector;
- workspace AI Agent settings;
- project AI Agent settings; and
- backend model validation and execution.

The catalog must expose exact API model IDs, readable labels, lifecycle status, and standard input/output token prices.

## Lifecycle policy

Include:

- current stable models;
- current preview models; and
- at most the immediate non-deprecated predecessor within a model family.

Exclude:

- deprecated or retired models;
- shut-down models;
- experimental models;
- limited-access models; and
- models older than the immediate predecessor.

Preview and previous-generation models remain selectable but are visibly labeled.

## Architecture

The backend owns the authoritative model catalog. Each provider entry contains:

- provider ID and display name;
- default model ID;
- models with an exact API ID, display name, lifecycle status, standard USD input/output price per million tokens, and an optional pricing note.

A read-only provider-catalog endpoint returns every provider and its model metadata. Existing configuration responses retain `available_models: string[]` for compatibility and add rich model metadata for the selected provider.

Frontend settings fetch the provider catalog and use it for provider switching, defaults, labels, prices, and status badges. The agent popup consumes the rich model metadata included with the effective configuration. The frontend no longer maintains a second model-ID list.

## Catalog

### OpenAI

- `gpt-5.6-sol` — GPT-5.6 Sol — $5 input / $30 output
- `gpt-5.6-terra` — GPT-5.6 Terra — $2 input / $12 output
- `gpt-5.6-luna` — GPT-5.6 Luna — $0.20 input / $1.20 output
- `gpt-5.5` — GPT-5.5 — previous — $5 input / $30 output

Default: `gpt-5.6-sol`.

### Anthropic

- `claude-fable-5` — Claude Fable 5 — $10 input / $50 output
- `claude-opus-5` — Claude Opus 5 — $5 input / $25 output
- `claude-opus-4-8` — Claude Opus 4.8 — previous — $5 input / $25 output
- `claude-sonnet-5` — Claude Sonnet 5 — $2 input / $10 output through August 31, 2026, then $3 / $15
- `claude-sonnet-4-6` — Claude Sonnet 4.6 — previous — $3 input / $15 output
- `claude-haiku-4-5-20251001` — Claude Haiku 4.5 — $1 input / $5 output

Default: `claude-sonnet-5`.

Claude Mythos is excluded because access is limited. Opus versions older than 4.8 and Sonnet versions older than 4.6 are excluded by policy.

### Gemini

- `gemini-3.1-pro-preview` — Gemini 3.1 Pro — preview — $2 input / $12 output for prompts up to 200k tokens; $4 / $18 above 200k
- `gemini-2.5-pro` — Gemini 2.5 Pro — previous — $1.25 input / $10 output for prompts up to 200k tokens; $2.50 / $15 above 200k
- `gemini-3.6-flash` — Gemini 3.6 Flash — $1.50 input / $7.50 output
- `gemini-3.5-flash` — Gemini 3.5 Flash — previous — $1.50 input / $9 output
- `gemini-3.5-flash-lite` — Gemini 3.5 Flash-Lite — $0.30 input / $2.50 output
- `gemini-3.1-flash-lite` — Gemini 3.1 Flash-Lite — previous — $0.25 input / $1.50 output

Default: `gemini-3.6-flash`.

Specialized image, audio, live, and managed-agent models are excluded because Plane's agent loop requires text chat, tool calling, and structured tool responses.

### Mistral

- `mistral-medium-3-5` — Mistral Medium 3.5 — preview — $1.50 input / $7.50 output
- `mistral-small-2603` — Mistral Small 4 — $0.15 input / $0.60 output
- `mistral-large-2512` — Mistral Large 3 — $0.50 input / $1.50 output

Default: `mistral-small-2603`.

Previous Medium, Small, and Large models are excluded because Mistral marks them deprecated.

## UI behavior

Model controls use a shared rich selector:

- primary text: friendly model name;
- secondary text: exact model ID;
- compact price: `$X in · $Y out / 1M`;
- optional `Preview` and `Previous` badges.

The selected-model trigger remains compact in the agent popup. The open menu shows full metadata. Workspace and project settings use the same model option renderer.

Prices represent standard synchronous API token rates. Batch, priority, cache, regional, tool, and free-tier modifiers are not folded into the headline price. Models with tiered or temporary pricing show a concise note.

## Compatibility and migration

Known obsolete or invalid saved IDs are migrated to the closest current tier:

- `gpt-5.5-mini` to `gpt-5.6-terra`;
- `gpt-5.5-nano` to `gpt-5.6-luna`;
- `gpt-5.5-pro` and unsupported OpenAI IDs to `gpt-5.6-sol`;
- `claude-opus-4-7` to `claude-opus-4-8`;
- old Gemini Flash IDs to their current recommended Flash or Flash-Lite replacement;
- invalid Mistral display-style IDs to the documented API IDs.

Any remaining unsupported saved model falls back to its provider default at runtime and is rejected on future writes.

Anthropic Opus 5 and Opus 4.8 use adaptive thinking rather than the obsolete manual thinking-budget request shape. The LLM adapter must avoid sending unsupported extended-thinking parameters to those models.

## Error handling

- Unknown providers return no catalog entry and fail serializer validation.
- Unknown models fail configuration validation with a provider-specific error.
- A stale saved model is normalized to the provider default before an LLM request, preventing avoidable provider failures.
- Catalog fetch failures show the existing settings error path rather than silently falling back to stale frontend data.

## Testing

Backend tests cover:

- catalog contents, defaults, ordering, lifecycle flags, and prices;
- catalog endpoint response;
- configuration provider/model validation;
- obsolete-ID migration and runtime fallback;
- Anthropic adaptive-thinking request construction.

Frontend unit tests cover:

- popup model labels, prices, and badges;
- workspace and project provider switching;
- default-model selection;
- preservation of the selected model when it remains valid;
- catalog-fetch error states.

Before any commit, run the repository-required frontend unit and end-to-end suites and the relevant Docker backend pytest suite.

## Sources

- OpenAI model catalog: https://developers.openai.com/api/docs/models
- OpenAI GPT-5.5: https://developers.openai.com/api/docs/models/gpt-5.5
- Anthropic models: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini deprecations: https://ai.google.dev/gemini-api/docs/deprecations
- Mistral models: https://docs.mistral.ai/models
- Mistral model cards: https://docs.mistral.ai/models/model-cards
