# Agent Model Catalog Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale agent model lists with one backend-owned catalog that supplies current model IDs, lifecycle labels, defaults, and standard token prices to the agent popup and project/workspace settings.

**Architecture:** `plane.agent.catalog` is the single source of truth. A workspace-scoped read-only endpoint exposes the full provider catalog, while configuration responses expose rich details for the effective provider and preserve the existing string list. Frontend settings fetch the catalog, and all three model controls render a shared rich selector.

**Tech Stack:** Django 4.2, Django REST Framework, pytest, AnyLLM, React 19, TypeScript, MobX, `@plane/ui` `CustomSelect`, Vitest, Testing Library.

## Global Constraints

- Include current stable models, current preview models, and at most the immediate non-deprecated predecessor within each family.
- Exclude deprecated, retired, shut-down, experimental, and limited-access models.
- Use exact pinned API IDs, not mutable `*-latest` aliases.
- Display standard synchronous USD input/output prices per one million tokens.
- Keep `available_models: string[]` in configuration responses for backward compatibility.
- Do not maintain a second frontend model-ID catalog.
- Do not commit until `pnpm --filter=web test:unit`, `pnpm test:e2e`, and the relevant Docker backend pytest suite have passed in this session.

---

### Task 1: Authoritative backend catalog

**Files:**

- Create: `apps/api/plane/agent/catalog.py`
- Create: `apps/api/plane/tests/agent/test_catalog.py`
- Modify: `apps/api/plane/app/views/external/base.py`

**Interfaces:**

- Produces: `MODEL_CATALOG: dict[str, ProviderDefinition]`
- Produces: `get_provider(provider: str) -> ProviderDefinition | None`
- Produces: `get_model(provider: str, model_id: str) -> ModelDefinition | None`
- Produces: `get_default_model(provider: str) -> str`
- Produces: `get_public_catalog() -> list[dict]`
- Produces: `normalize_model(provider: str, model_id: str | None) -> str`

- [ ] **Step 1: Write failing catalog tests**

```python
from plane.agent.catalog import (
    MODEL_CATALOG,
    get_default_model,
    get_model,
    get_public_catalog,
    normalize_model,
)


def test_catalog_uses_current_exact_model_ids():
    assert [model.id for model in MODEL_CATALOG["openai"].models] == [
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5",
    ]
    assert get_default_model("anthropic") == "claude-sonnet-5"
    assert get_default_model("gemini") == "gemini-3.6-flash"
    assert get_default_model("mistral") == "mistral-small-2603"


def test_catalog_exposes_prices_and_lifecycle():
    opus = get_model("anthropic", "claude-opus-4-8")
    assert opus is not None
    assert opus.lifecycle == "previous"
    assert opus.input_price == 5
    assert opus.output_price == 25

    gemini = get_model("gemini", "gemini-3.1-pro-preview")
    assert gemini is not None
    assert gemini.lifecycle == "preview"
    assert "above 200k" in gemini.pricing_note


def test_catalog_excludes_deprecated_models():
    assert get_model("anthropic", "claude-opus-4-7") is None
    assert get_model("mistral", "mistral-small-2506") is None
    assert get_model("gemini", "gemini-3-flash-preview") is None


def test_normalize_model_maps_known_obsolete_ids_and_defaults_unknown_ids():
    assert normalize_model("openai", "gpt-5.5-mini") == "gpt-5.6-terra"
    assert normalize_model("openai", "gpt-5.5-nano") == "gpt-5.6-luna"
    assert normalize_model("mistral", "mistral-small-4") == "mistral-small-2603"
    assert normalize_model("anthropic", "unknown") == "claude-sonnet-5"


def test_public_catalog_contains_only_json_safe_fields():
    catalog = get_public_catalog()
    assert catalog[0]["id"] == "openai"
    assert catalog[0]["models"][0] == {
        "id": "gpt-5.6-sol",
        "name": "GPT-5.6 Sol",
        "lifecycle": "stable",
        "input_price": 5,
        "output_price": 30,
        "pricing_note": "",
    }
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_catalog.py -q
```

Expected: collection fails because `plane.agent.catalog` does not exist.

- [ ] **Step 3: Implement immutable catalog definitions and helpers**

Use frozen dataclasses:

```python
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
```

Populate the catalog exactly as listed in the design spec. Set `reasoning_mode="adaptive"` for Claude Fable 5, Opus 5, Opus 4.8, and Sonnet 5; set `reasoning_mode="manual"` for Claude Sonnet 4.6 and Haiku 4.5.

Add explicit obsolete mappings:

```python
OBSOLETE_MODEL_REPLACEMENTS = {
    "openai": {
        "gpt-4o-mini": "gpt-5.6-luna",
        "gpt-5.5-mini": "gpt-5.6-terra",
        "gpt-5.5-nano": "gpt-5.6-luna",
        "gpt-5.5-pro": "gpt-5.6-sol",
    },
    "anthropic": {"claude-opus-4-7": "claude-opus-4-8"},
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
```

- [ ] **Step 4: Replace the legacy provider class lists**

Keep the `LLMProvider` classes in `external/base.py` for compatibility, but source their `models` and `default_model` fields from `MODEL_CATALOG`:

```python
class OpenAIProvider(LLMProvider):
    name = MODEL_CATALOG["openai"].name
    models = [model.id for model in MODEL_CATALOG["openai"].models]
    default_model = MODEL_CATALOG["openai"].default_model
```

Repeat for Anthropic, Gemini, and Mistral.

- [ ] **Step 5: Run the catalog tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_catalog.py -q
```

Expected: all catalog tests pass.

---

### Task 2: Catalog API, validation, and saved-configuration migration

**Files:**

- Modify: `apps/api/plane/agent/serializers/configuration.py`
- Modify: `apps/api/plane/agent/views/configuration.py`
- Modify: `apps/api/plane/agent/views/__init__.py`
- Modify: `apps/api/plane/agent/urls/agent.py`
- Modify: `apps/api/plane/tests/agent/test_configuration.py`
- Create: `apps/api/plane/db/migrations/0131_refresh_agent_model_ids.py`

**Interfaces:**

- Consumes: `get_provider`, `get_model`, `get_public_catalog`, and `normalize_model` from Task 1.
- Produces: `GET /api/workspaces/{slug}/agent/providers/`
- Produces: configuration field `available_model_details: list[dict]`
- Enforces: `model` must belong to the submitted or existing provider.

- [ ] **Step 1: Add failing endpoint and serializer tests**

```python
def test_get_provider_catalog(self, session_client, workspace):
    response = session_client.get(f"/api/workspaces/{workspace.slug}/agent/providers/")

    assert response.status_code == status.HTTP_200_OK
    assert [provider["id"] for provider in response.data] == [
        "openai",
        "anthropic",
        "gemini",
        "mistral",
    ]
    assert response.data[0]["models"][0]["id"] == "gpt-5.6-sol"


def test_config_response_includes_rich_model_details(self, session_client, workspace):
    AgentConfiguration.objects.create(
        workspace=workspace,
        provider="openai",
        model="gpt-5.6-sol",
    )
    response = session_client.get(f"/api/workspaces/{workspace.slug}/agent/config/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["available_models"][0] == "gpt-5.6-sol"
    assert response.data["available_model_details"][0]["name"] == "GPT-5.6 Sol"


def test_rejects_model_outside_selected_provider(self, session_client, workspace):
    response = session_client.post(
        f"/api/workspaces/{workspace.slug}/agent/config/",
        {
            "api_key": "sk-test-key",
            "provider": "anthropic",
            "model": "gpt-5.6-sol",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["model"] == ["Model is not supported by anthropic."]
```

- [ ] **Step 2: Run the focused configuration tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_configuration.py -q
```

Expected: failures for the missing route, missing rich field, and missing cross-field validation.

- [ ] **Step 3: Add rich serialization and cross-field validation**

Add:

```python
available_model_details = serializers.SerializerMethodField()

def get_available_models(self, instance):
    provider = get_provider(instance.provider)
    return [model.id for model in provider.models] if provider else []

def get_available_model_details(self, instance):
    provider = get_provider(instance.provider)
    return [model.to_public_dict() for model in provider.models] if provider else []

def validate(self, attrs):
    provider = attrs.get("provider", getattr(self.instance, "provider", "openai"))
    model = attrs.get("model", getattr(self.instance, "model", get_default_model(provider)))
    if not get_model(provider, model):
        raise serializers.ValidationError({"model": f"Model is not supported by {provider}."})
    return attrs
```

- [ ] **Step 4: Add the workspace-member catalog endpoint**

Add `AgentProviderCatalogView.get()`:

```python
class AgentProviderCatalogView(AgentBaseView):
    def get(self, request, slug):
        self.check_workspace_member(slug, request.user)
        return Response(get_public_catalog(), status=status.HTTP_200_OK)
```

Export it and register:

```python
path(
    "workspaces/<str:slug>/agent/providers/",
    AgentProviderCatalogView.as_view(),
    name="agent-provider-catalog",
),
```

- [ ] **Step 5: Add the data migration**

Create migration `0131_refresh_agent_model_ids.py` depending on `0130_user_mfa`. Use `apps.get_model("db", "AgentConfiguration")`, update known IDs with the same mapping as Task 1, and default remaining unsupported IDs by provider. Alter the model field default to `gpt-5.6-sol`.

The reverse migration is a no-op because restoring inaccessible model IDs would break saved configurations.

- [ ] **Step 6: Run configuration tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_configuration.py plane/tests/agent/test_catalog.py -q
```

Expected: all focused tests pass.

---

### Task 3: Runtime model normalization and Anthropic reasoning compatibility

**Files:**

- Modify: `apps/api/plane/agent/service/llm.py`
- Modify: `apps/api/plane/agent/service/loop.py`
- Create: `apps/api/plane/tests/agent/test_llm.py`
- Modify: `apps/api/plane/tests/agent/test_loop.py`

**Interfaces:**

- Consumes: `get_model` and `normalize_model` from Task 1.
- Produces: `_build_completion_kwargs(...) -> dict`
- Guarantees: every provider request uses a supported catalog model.

- [ ] **Step 1: Write failing request-construction tests**

```python
from plane.agent.service.llm import _build_completion_kwargs


def test_opus_5_high_reasoning_uses_adaptive_thinking():
    kwargs = _build_completion_kwargs(
        messages=[{"role": "user", "content": "Hello"}],
        tools=[],
        provider="anthropic",
        model="claude-opus-5",
        reasoning_level="high",
    )

    assert kwargs["thinking"] == {"type": "adaptive"}
    assert kwargs["output_config"] == {"effort": "high"}
    assert "max_tokens" in kwargs


def test_haiku_high_reasoning_keeps_manual_budget():
    kwargs = _build_completion_kwargs(
        messages=[{"role": "user", "content": "Hello"}],
        tools=[],
        provider="anthropic",
        model="claude-haiku-4-5-20251001",
        reasoning_level="high",
    )

    assert kwargs["thinking"] == {"type": "enabled", "budget_tokens": 8000}
    assert "output_config" not in kwargs
```

Add a loop test asserting an obsolete stored `gpt-5.5-mini` value reaches mocked `call_llm` as `gpt-5.6-terra`.

- [ ] **Step 2: Run the focused runtime tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_llm.py plane/tests/agent/test_loop.py -q
```

Expected: `_build_completion_kwargs` is missing and the loop forwards the stale model.

- [ ] **Step 3: Extract and implement request construction**

Move the current `kwargs` construction into `_build_completion_kwargs`. Look up the model definition and apply:

```python
if provider == "anthropic":
    kwargs["max_tokens"] = 8192
    definition = get_model(provider, model)
    if reasoning_level != "none" and definition and definition.reasoning_mode == "adaptive":
        kwargs["thinking"] = {"type": "adaptive"}
        kwargs["output_config"] = {"effort": reasoning_level}
    elif reasoning_level == "high":
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 8000}
```

Keep the existing OpenAI reasoning behavior. Do not add unverified provider-specific parameters for Gemini or Mistral.

- [ ] **Step 4: Normalize model selection in the loop**

Replace:

```python
model = model_override or config.model
```

with:

```python
model = normalize_model(config.provider, model_override or config.model)
```

This protects old rows and stale session overrides even before migrations run.

- [ ] **Step 5: Run focused runtime tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_llm.py plane/tests/agent/test_loop.py -q
```

Expected: all focused runtime tests pass.

---

### Task 4: Frontend catalog types, service, and shared rich selector

**Files:**

- Modify: `packages/types/src/agent.ts`
- Modify: `packages/constants/src/agent.ts`
- Modify: `apps/web/services/agent.service.ts`
- Create: `apps/web/core/components/agent/model-select.tsx`
- Create: `apps/web/core/components/agent/__tests__/model-select.test.tsx`

**Interfaces:**

- Produces: `TAgentModelLifecycle = "stable" | "preview" | "previous"`
- Produces: `IAgentModel`, `IAgentProvider`, `IAgentProviderCatalog`
- Produces: `AgentService.getProviderCatalog(workspaceSlug) -> Promise<IAgentProvider[]>`
- Produces: `<AgentModelSelect models value onChange compact disabled />`

- [ ] **Step 1: Write the failing selector test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentModelSelect } from "../model-select";

const models = [
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    lifecycle: "preview",
    input_price: 2,
    output_price: 12,
    pricing_note: "$4 in · $18 out above 200k tokens",
  },
];

describe("AgentModelSelect", () => {
  it("shows model identity, lifecycle, and standard pricing", () => {
    render(<AgentModelSelect models={models} value={models[0].id} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Gemini 3.1 Pro")).toBeInTheDocument();
    expect(screen.getByText("gemini-3.1-pro-preview")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("$2 in · $12 out / 1M")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused frontend test**

Run:

```bash
pnpm --filter=web test:unit -- core/components/agent/__tests__/model-select.test.tsx
```

Expected: module import fails because `AgentModelSelect` does not exist.

- [ ] **Step 3: Define API types**

Add:

```typescript
export type TAgentModelLifecycle = "stable" | "preview" | "previous";

export interface IAgentModel {
  id: string;
  name: string;
  lifecycle: TAgentModelLifecycle;
  input_price: number;
  output_price: number;
  pricing_note: string;
}

export interface IAgentProvider {
  id: string;
  name: string;
  default_model: string;
  models: IAgentModel[];
}
```

Add `available_model_details: IAgentModel[]` to `IAgentConfig`.

- [ ] **Step 4: Remove frontend model-ID duplication**

Keep `AGENT_PROVIDERS` and `AGENT_DEFAULT_MAX_STEPS` in `packages/constants/src/agent.ts`, but remove `AGENT_PROVIDER_MODELS`, `getAgentModelsForProvider`, and `getDefaultAgentModelForProvider`.

- [ ] **Step 5: Add the catalog service method**

```typescript
async getProviderCatalog(workspaceSlug: string): Promise<IAgentProvider[]> {
  return this.get(`/api/workspaces/${workspaceSlug}/agent/providers/`)
    .then((response) => response?.data)
    .catch((error) => {
      throw toAgentHttpError(error, "Unable to load AI Agent providers.");
    });
}
```

- [ ] **Step 6: Implement the shared selector**

Build `AgentModelSelect` with `CustomSelect`. Its selected button shows the friendly name and, unless `compact`, the standard price. Each option shows:

```tsx
<div className="min-w-0">
  <div className="flex items-center gap-2">
    <span className="font-medium text-primary">{model.name}</span>
    {model.lifecycle !== "stable" && <span>{model.lifecycle === "preview" ? "Preview" : "Previous"}</span>}
  </div>
  <div className="text-xs text-tertiary">{model.id}</div>
  <div className="text-xs text-secondary">
    ${model.input_price} in · ${model.output_price} out / 1M
  </div>
  {model.pricing_note && <div className="text-xs text-tertiary">{model.pricing_note}</div>}
</div>
```

Use an accessible button label of `Model: {selected.name}`.

- [ ] **Step 7: Run the selector test**

Run:

```bash
pnpm --filter=web test:unit -- core/components/agent/__tests__/model-select.test.tsx
```

Expected: the selector test passes.

---

### Task 5: Connect popup and settings to the backend catalog

**Files:**

- Modify: `apps/web/core/components/agent/input/model-selector.tsx`
- Modify: `apps/web/core/components/settings/workspace/content/ai-agent-settings.tsx`
- Modify: `apps/web/core/components/settings/project/content/ai-agent-settings.tsx`
- Modify: `apps/web/core/store/agent/agent.store.ts`
- Create: `apps/web/core/components/settings/__tests__/ai-agent-model-catalog.test.tsx`

**Interfaces:**

- Consumes: `IAgentProvider[]`, `IAgentModel[]`, and `AgentModelSelect` from Task 4.
- Guarantees: popup and settings render identical catalog labels and prices.

- [ ] **Step 1: Write failing integration-oriented component tests**

Mock `AgentService.getProviderCatalog()` with OpenAI and Anthropic provider entries. Assert:

```tsx
expect(await screen.findByText("GPT-5.6 Sol")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "anthropic" }));
expect(screen.getByRole("button", { name: "Model: Claude Sonnet 5" })).toBeInTheDocument();
```

For the popup, mock `useAgent()` with `available_model_details` and assert the selected model changes when the rich option is selected.

- [ ] **Step 2: Run the focused frontend tests**

Run:

```bash
pnpm --filter=web test:unit -- core/components/agent/__tests__/model-select.test.tsx core/components/settings/__tests__/ai-agent-model-catalog.test.tsx
```

Expected: settings still use removed static helpers and the popup still renders a native string select.

- [ ] **Step 3: Update the popup**

Replace its native `<select>` with:

```tsx
<AgentModelSelect
  compact
  models={agent.config?.available_model_details ?? []}
  value={selectedValue}
  onChange={agent.setSelectedModel}
/>
```

- [ ] **Step 4: Update workspace settings**

Load provider catalog and existing configuration together. Derive provider models and defaults from the fetched provider object:

```typescript
const selectedProvider = providers.find((item) => item.id === config.provider);
const providerModels = selectedProvider?.models ?? [];
const selectedModel =
  providerModels.find((item) => item.id === config.model)?.id ?? selectedProvider?.default_model ?? "";
```

Replace the model native `<select>` with `AgentModelSelect`. On provider change, choose `selectedProvider.default_model`.

- [ ] **Step 5: Update project settings**

Fetch the provider catalog with workspace and project configurations. Use it in `createOverrideFromWorkspace`, provider switching, and model validation. Preserve the inherited workspace summary.

- [ ] **Step 6: Update disabled store configuration**

The disabled fallback must not invent a model ID. Use empty model lists/details and an empty selected model until the backend effective configuration is available:

```typescript
model: "",
available_models: [],
available_model_details: [],
```

- [ ] **Step 7: Run focused frontend tests**

Run:

```bash
pnpm --filter=web test:unit -- core/components/agent/__tests__/model-select.test.tsx core/components/settings/__tests__/ai-agent-model-catalog.test.tsx
```

Expected: all focused frontend tests pass.

---

### Task 6: Full verification

**Files:**

- Modify only files required by formatter or test corrections.

- [ ] **Step 1: Run backend agent unit tests**

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit plane/tests/agent -q
```

Expected: all agent unit tests pass.

- [ ] **Step 2: Run frontend unit tests**

```bash
pnpm --filter=web test:unit
```

Expected: all web unit tests pass.

- [ ] **Step 3: Run formatting, lint, and type checks**

```bash
pnpm fix:format
pnpm check:lint
pnpm check:types
```

Expected: all checks pass. Review formatter changes and keep only files in task scope.

- [ ] **Step 4: Run required end-to-end tests**

If the stack is not running:

```bash
docker compose -f docker-compose-local.yml -p wrrw-e2e up -d --build
```

Then run:

```bash
pnpm test:e2e
```

Expected: all required end-to-end tests pass.

- [ ] **Step 5: Inspect the final diff**

```bash
git status --short
git diff --check
git diff -- apps/api/plane/agent apps/api/plane/app/views/external/base.py apps/api/plane/db/migrations/0131_refresh_agent_model_ids.py apps/api/plane/tests/agent apps/web/core/components/agent apps/web/core/components/settings apps/web/core/store/agent packages/types/src/agent.ts packages/constants/src/agent.ts docs/superpowers
```

Expected: no whitespace errors, no unrelated user files changed, no duplicated frontend model list, and no deprecated model IDs except migration mappings and negative tests.

- [ ] **Step 6: Do not commit unless every required test passed**

Report any failing suite with its exact command and failure. If all required suites pass, leave the changes uncommitted unless the user separately asks for a commit.
