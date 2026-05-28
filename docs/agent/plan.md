# Plan: Plane AI Agent Chat Feature

**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** In progress (backend core scaffold implemented, validation in progress)

Mark tasks `[x]` as you complete them.

## Progress Update (2026-05-27)

### Completed in this pass

- [x] Backend model definitions exist in `apps/api/plane/db/models/agent.py`
- [x] Agent app registered in `apps/api/plane/settings/common.py`
- [x] Provider catalog expanded (OpenAI/Anthropic/Gemini/Mistral) in `apps/api/plane/app/views/external/base.py`
- [x] `any-llm-sdk` added in `apps/api/requirements/base.txt`
- [x] `service/llm.py` and `service/context.py` implemented
- [x] New backend migration created manually as `apps/api/plane/db/migrations/0127_agent_models.py`
- [x] Migration applied successfully in running API container (`db.0127_agent_models`)
- [x] Agent serializers implemented (`configuration`, `session`, `message`)
- [x] Agent views implemented (`base`, `configuration`, `session`, `chat`)
- [x] Agent routing implemented and mounted via `apps/api/plane/urls.py`
- [x] Agent loop implemented in `apps/api/plane/agent/service/loop.py`
- [x] Agent tools implemented (`work_items`, `cycles`, `modules`, `states_labels`, `search`, `registry`)
- [x] `packages/types/src/agent.ts` added and exported via `packages/types/src/index.ts`

### Still outstanding after this pass

- [ ] Finalize frontend MobX agent store and chat UI component tree (base scaffold added; settings/i18n/tests pending)
- [ ] Workspace/project AI Agent settings pages
- [ ] Backend/API/frontend automated tests for new agent feature
- [ ] i18n additions for new UI strings
- [ ] Full end-to-end pass for all acceptance criteria

### Validation run log (2026-05-28)

- [x] `docker compose exec -T api python manage.py check` (pass)
- [x] `docker compose exec -T api python manage.py migrate` applied `db.0127_agent_models` (pass)
- [x] `docker compose build api web` (pass)
- [x] `pnpm fix:format` (pass)
- [x] `pnpm check:lint` (pass with existing warnings in `apps/live`)
- [ ] `pnpm check:types` and `pnpm turbo run check:types --filter=web` (both fail before project type analysis due `react-router typegen` + `chokidar` ESM mismatch under current Node/toolchain)
- [ ] `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit` (fails outside agent scope in recurrence serializer tests; 6 failures in `plane/tests/unit/serializers/test_issue_recurrence.py`)
- [ ] Browser E2E for agent flow (blocked by authentication; app loads and auth gate verified, but no test credentials provided)

### Additional implementation completed (2026-05-28)

- [x] Added frontend agent store scaffold:
  - `apps/web/core/store/agent/agent.store.ts`
  - `apps/web/core/store/agent/index.ts`
  - Root-store integration in `apps/web/core/store/root.store.ts`
- [x] Added `useAgent` hook: `apps/web/core/hooks/store/use-agent.ts`
- [x] Added base agent UI component tree:
  - FAB: `apps/web/core/components/agent/fab/index.tsx`
  - Chat window: `apps/web/core/components/agent/chat-window/*`
  - Messages: `apps/web/core/components/agent/messages/*`
  - Input area: `apps/web/core/components/agent/input/*`
  - Barrel: `apps/web/core/components/agent/index.ts`
- [x] Mounted agent UI in workspace projects layout:
  - `apps/web/app/(all)/[workspaceSlug]/(projects)/layout.tsx`
- [x] Added workspace/project AI Agent settings foundations:
  - Workspace constants/icons entries (`packages/constants/src/settings/workspace.ts`, `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`)
  - Project constants/icons entries (`packages/constants/src/settings/project.ts`, `apps/web/core/components/settings/project/sidebar/item-icon.tsx`)
  - New settings type keys in `packages/types/src/settings.ts`
  - Workspace settings page + header + form component
  - Project settings page + header + form component

---

## Phase 1: Backend Foundation

### 1.1 Database Models

- [ ] **1.1.1** Create `apps/api/plane/db/models/agent.py`
  - [ ] Define `AgentConfiguration` model with fields: `workspace`, `project` (nullable FK), `provider`, `api_key_encrypted`, `model`, `max_steps`, `reasoning_level`, `is_enabled`, `system_prompt`
  - [ ] Add `UniqueConstraint` so only one workspace-level config and one per project
  - [ ] Define `AgentChatSession` model with fields: `workspace`, `project` (nullable FK), `user`, `title`, `selected_model`, `is_active`
  - [ ] Define `AgentChatMessage` model with fields: `session`, `role`, `content`, `tool_calls`, `tool_call_id`, `tool_name`, `tool_input`, `tool_output`, `model_used`, `tokens_sent`, `tokens_received`, `reasoning_tokens`, `step_index`, `latency_ms`, `is_error`
  - [ ] Add `db_table` names and `ordering` to all three `Meta` classes
  - [ ] Add index on `(session, created_at)` for `AgentChatMessage`

- [ ] **1.1.2** Update `apps/api/plane/db/models/__init__.py`
  - [ ] Import `AgentConfiguration`, `AgentChatSession`, `AgentChatMessage` from `agent`
  - [ ] Export all three in `__all__`

- [ ] **1.1.3** Generate and review Django migration
  - [ ] Run `python manage.py makemigrations db --name=agent_models`
  - [ ] Review generated migration file for correctness
  - [ ] Run `python manage.py migrate` locally to verify it applies cleanly

---

### 1.2 Django App Scaffold

- [ ] **1.2.1** Create the `plane/agent` app directory structure
  ```
  apps/api/plane/agent/
  ├── __init__.py
  ├── apps.py
  ├── serializers/__init__.py
  ├── views/__init__.py
  ├── urls/__init__.py
  ├── service/__init__.py
  └── tools/__init__.py
  ```

  - [ ] Write `apps.py` with `name = "plane.agent"` and `default_auto_field = "django.db.models.BigAutoField"`
  - [ ] Add `"plane.agent"` to `INSTALLED_APPS` in `apps/api/plane/settings/common.py`

---

### 1.3 Serializers

- [ ] **1.3.1** Create `apps/api/plane/agent/serializers/configuration.py`
  - [ ] `AgentConfigSerializer` — all fields except `api_key_encrypted`
  - [ ] Add a `SerializerMethodField` `api_key_set` that returns `bool(instance.api_key_encrypted)`
  - [ ] Add a `SerializerMethodField` `available_models` that returns `SUPPORTED_PROVIDERS[instance.provider].models`
  - [ ] Import `SUPPORTED_PROVIDERS` from `plane.app.views.external.base`
  - [ ] On `create`/`update`: accept a write-only `api_key` field; if provided, run `encrypt_data(api_key)` and save to `api_key_encrypted`; if omitted during update, keep existing encrypted value

- [ ] **1.3.2** Create `apps/api/plane/agent/serializers/session.py`
  - [ ] `AgentChatSessionSerializer` — all fields
  - [ ] Add `SerializerMethodField` `last_message_preview` that returns the last assistant message's content (first 80 chars)

- [ ] **1.3.3** Create `apps/api/plane/agent/serializers/message.py`
  - [ ] `AgentChatMessageSerializer` — all fields, read-only

- [ ] **1.3.4** Update `apps/api/plane/agent/serializers/__init__.py` to export all three serializers

---

### 1.4 Views

- [ ] **1.4.1** Create `apps/api/plane/agent/views/base.py`
  - [ ] `AgentBaseView(BaseAPIView)` — extends existing `BaseAPIView`
  - [ ] Add helper `get_agent_config(workspace_slug, project_id=None)` that returns the effective config (project first, then workspace)
  - [ ] Add `check_agent_enabled(config)` helper that raises `PermissionDenied` if config is None or `is_enabled == False`
  - [ ] Add `check_workspace_member(workspace_slug, user)` helper (same pattern as existing views)

- [ ] **1.4.2** Create `apps/api/plane/agent/views/configuration.py`
  - [ ] `WorkspaceAgentConfigView(AgentBaseView)`
    - [ ] `GET`: Fetch or return 404; serialize without api_key; return 200
    - [ ] `POST`: Check user is workspace ADMIN; encrypt api_key if provided; upsert record; return 200
  - [ ] `ProjectAgentConfigView(AgentBaseView)`
    - [ ] Same as workspace but scoped to project
    - [ ] Check user is project ADMIN for writes

- [ ] **1.4.3** Create `apps/api/plane/agent/views/session.py`
  - [ ] `AgentSessionListCreateView(AgentBaseView)`
    - [ ] `GET`: Return sessions for `request.user` in workspace, ordered by `-created_at`
    - [ ] `POST`: Create new session; auto-set `user=request.user`
  - [ ] `AgentSessionDetailView(AgentBaseView)`
    - [ ] `GET`: Return session + messages (verify `session.user == request.user`)
    - [ ] `DELETE`: Soft-delete the session (set `is_active=False`)

- [ ] **1.4.4** Create `apps/api/plane/agent/views/chat.py`
  - [ ] `AgentChatView(AgentBaseView)`
    - [ ] `POST`: Validate session ownership; validate `content` not empty; call `AgentService.run()`; return serialized new messages

- [ ] **1.4.5** Update `apps/api/plane/agent/views/__init__.py` to export all view classes

---

### 1.5 URL Patterns

- [ ] **1.5.1** Create `apps/api/plane/agent/urls/agent.py` with the following patterns:

  ```
  workspaces/<slug>/agent/config/
  workspaces/<slug>/projects/<project_id>/agent/config/
  workspaces/<slug>/agent/sessions/
  workspaces/<slug>/agent/sessions/<uuid:session_id>/
  workspaces/<slug>/agent/sessions/<uuid:session_id>/chat/
  ```

- [ ] **1.5.2** Register agent URLs in `apps/api/plane/urls.py`
  - [ ] Add `path("api/", include("plane.agent.urls.agent"))` in the urlpatterns list

---

### 1.6 Agent Service — LLM Layer

- [ ] **1.6.0** Add `any-llm-sdk` to `apps/api/requirements/base.txt`
  - [ ] Add `any-llm-sdk[openai,anthropic,gemini,mistral]` (or `[all]` for all providers) — this pulls in each provider's official SDK automatically
  - [ ] Remove any separate `anthropic`, `google-generativeai`, `mistralai` entries if added manually — any-llm handles them as extras
  - [ ] Run `pip install 'any-llm-sdk[openai,anthropic,gemini,mistral]'` in the dev container and confirm the import works: `python -c "from any_llm import AnyLLM; print('ok')"`

- [ ] **1.6.1** Create `apps/api/plane/agent/service/llm.py`
  - [ ] Import `AnyLLM` from `any_llm` and the exception types: `AuthenticationError`, `MissingApiKeyError`, `RateLimitError`, `ContextLengthExceededError`, `ProviderError` from `any_llm.exceptions`
  - [ ] Define `LLMResponse` dataclass with fields: `content`, `tool_calls`, `tokens_sent`, `tokens_received`, `reasoning_tokens`, `latency_ms`, `finish_reason` (all with safe defaults)
  - [ ] Implement `call_llm(*, messages, tools, provider, model, api_key, reasoning_level)` → `LLMResponse`
    - [ ] Create provider client: `llm = AnyLLM.create(provider, api_key=api_key)` (production-recommended approach with connection pooling)
    - [ ] Base kwargs: `model=model`, `messages=messages`, `timeout=30` (note: `api_key` is passed to `AnyLLM.create()`, not kwargs)
    - [ ] If `tools` non-empty: add `tools=tools, tool_choice="auto"`
    - [ ] OpenAI o-series (`o1*`, `o3*`, `o4*`): add `reasoning_effort=reasoning_level` when `reasoning_level != "none"`
    - [ ] Anthropic + `reasoning_level == "high"`: add `thinking={"type": "enabled", "budget_tokens": 8000}`
    - [ ] All other providers (Gemini, Mistral, …): pass through unchanged — any-llm delegates to each provider's official SDK
    - [ ] Call `llm.completion(**kwargs)` inside a try/except block
    - [ ] Catch `(AuthenticationError, MissingApiKeyError)` → raise `ValueError("Invalid or missing API key ...")`
    - [ ] Catch `RateLimitError` → raise `ValueError("Rate limit exceeded ...")`
    - [ ] Catch `ContextLengthExceededError` → raise `ValueError("Context length exceeded ...")`
    - [ ] Catch `ProviderError` → raise `ValueError("Provider error from ... : {exc}")` (covers timeouts and other provider-level errors)
    - [ ] Re-raise all other exceptions after calling `log_exception(exc)`
    - [ ] Normalise `choice.message.tool_calls` to plain dicts (`{"id", "type", "function": {"name", "arguments"}}`)
    - [ ] Extract `reasoning_tokens` from `usage.completion_tokens_details.reasoning_tokens` (safe `getattr` chain, default `0`)
    - [ ] Measure wall-clock latency with `time.monotonic()` around the `llm.completion` call
    - [ ] Return populated `LLMResponse`
  - [ ] Write a short docstring explaining the separate `provider` / `model` parameter approach and linking to https://docs.mozilla.ai/any-llm/providers/

- [ ] **1.6.2** Update `apps/api/plane/app/views/external/base.py` — expand `SUPPORTED_PROVIDERS` with up-to-date models and add Mistral as a fourth provider example
  - [ ] `OpenAIProvider.models`: update list to include `o3-mini`, `gpt-4o`, `gpt-4.1`, etc.
  - [ ] `AnthropicProvider.models`: update to current Claude 3.5 / 3.7 model slugs
  - [ ] `GeminiProvider.models`: update to `gemini-1.5-pro-latest`, `gemini-2.0-flash`, etc.
  - [ ] Add `MistralProvider` with models `mistral-large-latest`, `mistral-small-latest`, `codestral-latest`
  - [ ] Add `"mistral": MistralProvider` to `SUPPORTED_PROVIDERS`
  - [ ] Provider ID strings must match the [any-llm provider docs](https://docs.mozilla.ai/any-llm/providers/) (e.g. `"openai"`, `"anthropic"`, `"gemini"`, `"mistral"`)
  - [ ] No changes to the call site — provider list is now purely declarative for the UI

- [ ] **1.6.3** Create `apps/api/plane/agent/service/context.py`
  - [ ] Implement `build_system_prompt(workspace_slug, project_id, user_display_name, custom_prompt)` → `str`
  - [ ] Include: Plane identity, user name, workspace slug, active project context, tool-use instructions, custom prompt if provided

---

### 1.7 Agent Tools

- [ ] **1.7.1** Create `apps/api/plane/agent/tools/work_items.py`
  - [ ] `list_work_items(request_user, workspace_slug, project_id, state_id, priority, query, limit, **kwargs)` → `dict`
    - [ ] Use `Issue.issue_objects` manager with workspace/project membership filter
    - [ ] Support filtering by state_id, priority, name icontains
    - [ ] Return list of dicts: id, identifier (e.g. PROJ-42), name, priority, state name, assignees
  - [ ] `get_work_item(request_user, workspace_slug, issue_id=None, identifier=None, **kwargs)` → `dict`
    - [ ] Support lookup by UUID or by project_identifier-sequence_id string
    - [ ] Return full fields including description, labels, comments count
  - [ ] `create_work_item(request_user, workspace_slug, project_id, name, ...)` → `dict`
    - [ ] Check `ProjectMember` permission (ADMIN or MEMBER)
    - [ ] Use default state if none provided
    - [ ] Create `IssueAssignee` records for assignee_ids
    - [ ] Create `IssueLabel` records for label_ids
    - [ ] Return created issue dict
  - [ ] `update_work_item(request_user, workspace_slug, issue_id, **fields)` → `dict`
    - [ ] Fetch issue; verify user is project ADMIN or MEMBER
    - [ ] Apply only provided fields; save
    - [ ] Handle assignee/label updates by diffing existing vs new lists
  - [ ] `delete_work_item(request_user, workspace_slug, issue_id, **kwargs)` → `dict`
    - [ ] Verify ADMIN or MEMBER role
    - [ ] Soft-delete using existing `deleted_at` pattern
    - [ ] Return `{"deleted": True, "id": issue_id}`
  - [ ] `add_work_item_comment(request_user, workspace_slug, issue_id, comment, **kwargs)` → `dict`
    - [ ] Create `IssueComment` with `actor=request_user`
    - [ ] Return created comment dict

- [ ] **1.7.2** Create `apps/api/plane/agent/tools/cycles.py`
  - [ ] `list_cycles(request_user, workspace_slug, project_id, **kwargs)` → `dict`
  - [ ] `get_cycle(request_user, workspace_slug, cycle_id, **kwargs)` → `dict`
  - [ ] `create_cycle(request_user, workspace_slug, project_id, name, start_date, end_date, description, **kwargs)` → `dict`
  - [ ] `update_cycle(request_user, workspace_slug, cycle_id, **fields)` → `dict`
  - [ ] `add_issues_to_cycle(request_user, workspace_slug, cycle_id, issue_ids, **kwargs)` → `dict`
    - [ ] Create `CycleIssue` records for each issue_id; handle existing duplicates gracefully
  - [ ] `remove_issue_from_cycle(request_user, workspace_slug, cycle_id, issue_id, **kwargs)` → `dict`

- [ ] **1.7.3** Create `apps/api/plane/agent/tools/modules.py`
  - [ ] `list_modules(request_user, workspace_slug, project_id, **kwargs)` → `dict`
  - [ ] `get_module(request_user, workspace_slug, module_id, **kwargs)` → `dict`
  - [ ] `create_module(request_user, workspace_slug, project_id, name, status, start_date, target_date, description, **kwargs)` → `dict`
  - [ ] `update_module(request_user, workspace_slug, module_id, **fields)` → `dict`
  - [ ] `add_issues_to_module(request_user, workspace_slug, module_id, issue_ids, **kwargs)` → `dict`
    - [ ] Create `ModuleIssue` records; handle duplicates
  - [ ] `remove_issue_from_module(request_user, workspace_slug, module_id, issue_id, **kwargs)` → `dict`

- [ ] **1.7.4** Create `apps/api/plane/agent/tools/states_labels.py`
  - [ ] `list_states(request_user, workspace_slug, project_id, **kwargs)` → `dict`
  - [ ] `list_labels(request_user, workspace_slug, project_id, **kwargs)` → `dict`
  - [ ] `list_members(request_user, workspace_slug, project_id=None, **kwargs)` → `dict`
    - [ ] If project_id provided, return `ProjectMember`; else return `WorkspaceMember`
  - [ ] `list_projects(request_user, workspace_slug, **kwargs)` → `dict`
    - [ ] Return projects where user is a member

- [ ] **1.7.5** Create `apps/api/plane/agent/tools/search.py`
  - [ ] `search(request_user, workspace_slug, query, project_id=None, **kwargs)` → `dict`
    - [ ] Use existing `GlobalSearchEndpoint` logic or query issues/modules/cycles by name icontains
    - [ ] Return categorized results: issues, cycles, modules

- [ ] **1.7.6** Create `apps/api/plane/agent/tools/registry.py`
  - [ ] Define `TOOL_REGISTRY` dict mapping tool name → function
  - [ ] Define `TOOL_DEFINITIONS` list with OpenAI function-calling JSON schemas for all 23 tools
  - [ ] Implement `get_tool_definitions()` returning `TOOL_DEFINITIONS`
  - [ ] Implement `ToolExecutor` class with `execute(tool_name, arguments)` method
    - [ ] Injects `request_user`, `workspace_slug`, `default_project_id` into all calls
    - [ ] Raises `ValueError` for unknown tool names

---

### 1.8 Agentic Loop

- [ ] **1.8.1** Create `apps/api/plane/agent/service/loop.py`
  - [ ] Define `AgentDisabledError(Exception)` custom exception class
  - [ ] Implement `AgentService` class with `run(session, user_content, project_id, model_override, request_user)` method
  - [ ] `_get_config(workspace, project_id)` — tries project config first, falls back to workspace config
  - [ ] `_build_history(session)` — converts DB `AgentChatMessage` rows to OpenAI-compatible message list
  - [ ] Main loop:
    - [ ] Load config, decrypt api_key
    - [ ] Persist user message first (so it's always saved even if LLM fails)
    - [ ] Build system prompt via `build_system_prompt()`
    - [ ] Get `ToolExecutor` and `get_tool_definitions()`
    - [ ] Import and call `call_llm(messages, tools, provider, model, api_key, reasoning_level)` from `plane.agent.service.llm`
    - [ ] While loop up to `max_steps`:
      - [ ] Call LLM
      - [ ] If tool_calls: persist assistant msg, execute tools one-by-one, persist each tool result, append to message list, increment step
      - [ ] Else: persist final assistant msg, break
    - [ ] On loop exhaustion (max_steps): persist error message
    - [ ] Return list of all newly created `AgentChatMessage` instances

---

### 1.9 Backend Tests

- [ ] **1.9.1** Write unit tests for tool functions in `apps/api/plane/tests/agent/`
  - [ ] `test_list_work_items_respects_membership` — user not in project sees no results
  - [ ] `test_create_work_item_permission` — Guest role cannot create
  - [ ] `test_create_work_item_success` — Member can create; record appears in DB
  - [ ] `test_update_work_item` — correct fields updated
  - [ ] `test_delete_work_item` — soft deleted
  - [ ] `test_cycle_tools` — create, list, add/remove issues
  - [ ] `test_module_tools` — create, list, add/remove issues

- [ ] **1.9.2** Write unit tests for `AgentService.run()` using mocked `any_llm.AnyLLM.create`
  - [ ] Mock `AnyLLM.create` to return a mock client whose `.completion()` returns an immediate final response — verify 2 messages created (user + assistant)
  - [ ] Mock to return one tool call then a final response — verify 4 messages created
  - [ ] Mock to always return tool calls — verify loop stops at `max_steps`
  - [ ] Mock `.completion()` to raise `any_llm.exceptions.AuthenticationError` — verify `ValueError("Invalid or missing API key")` is surfaced
  - [ ] Mock `.completion()` to raise `any_llm.exceptions.RateLimitError` — verify `ValueError("Rate limit exceeded")` is surfaced
  - [ ] Mock `.completion()` to raise `any_llm.exceptions.ProviderError` — verify `ValueError("Provider error")` is surfaced

- [ ] **1.9.3** Write API tests for endpoints
  - [ ] Unauthenticated request → 401
  - [ ] Non-workspace-member → 403
  - [ ] GET config when none exists → 404
  - [ ] POST config as Member → 403; as Admin → 200
  - [ ] POST config with api_key → `api_key_set: true` in response, raw key absent
  - [ ] POST /sessions/ → session created
  - [ ] POST /sessions/:id/chat/ → returns messages array

---

## Phase 2: Frontend Foundation

### 2.1 TypeScript Types

- [ ] **2.1.1** Create `packages/types/src/agent.ts`
  - [ ] `IAgentConfig` interface
  - [ ] `IAgentChatSession` interface
  - [ ] `IAgentChatMessage` interface
  - [ ] `IToolCall` interface

- [ ] **2.1.2** Export from `packages/types/src/index.ts`
  - [ ] Add `export * from "./agent";`

---

### 2.2 Service Layer

- [ ] **2.2.1** Create `apps/web/core/services/agent.service.ts`
  - [ ] Extend `APIService`
  - [ ] Implement `getWorkspaceConfig(workspaceSlug)` → GET
  - [ ] Implement `saveWorkspaceConfig(workspaceSlug, data)` → POST
  - [ ] Implement `getProjectConfig(workspaceSlug, projectId)` → GET
  - [ ] Implement `saveProjectConfig(workspaceSlug, projectId, data)` → POST
  - [ ] Implement `listSessions(workspaceSlug)` → GET
  - [ ] Implement `createSession(workspaceSlug, projectId?)` → POST
  - [ ] Implement `getSession(workspaceSlug, sessionId)` → GET
  - [ ] Implement `deleteSession(workspaceSlug, sessionId)` → DELETE
  - [ ] Implement `sendMessage(workspaceSlug, sessionId, data)` → POST

---

### 2.3 MobX Store

- [ ] **2.3.1** Create `apps/web/core/store/agent/agent.store.ts`
  - [ ] Define `IAgentStore` interface with all observable fields and action types
  - [ ] Implement `AgentStore` class:
    - [ ] Observable fields: `isOpen`, `isLoading`, `config`, `sessions`, `activeSessionId`, `activeSessionMessages`, `selectedModel`, `unreadCount`
    - [ ] `toggleChatWindow()` — toggles `isOpen`; clears unreadCount when opening
    - [ ] `openChatWindow()` / `closeChatWindow()`
    - [ ] `fetchConfig(workspaceSlug)` — GET config; set `selectedModel` if not already set
    - [ ] `fetchSessions(workspaceSlug)` — GET sessions list
    - [ ] `loadSession(workspaceSlug, sessionId)` — GET session messages
    - [ ] `createSession(workspaceSlug, projectId?)` — POST; prepend to sessions list; set as active
    - [ ] `sendMessage(workspaceSlug, content, projectId?)` — optimistic update; POST chat; replace optimistic with real
    - [ ] `setSelectedModel(model)` — update `selectedModel`
    - [ ] `setActiveSession(sessionId)` — update `activeSessionId`

- [ ] **2.3.2** Create `apps/web/core/store/agent/index.ts`
  - [ ] Export `AgentStore`, `IAgentStore`

- [ ] **2.3.3** Update `apps/web/core/store/root.store.ts`
  - [ ] Import `AgentStore` from `./agent`
  - [ ] Add `agent: AgentStore` field to `CoreRootStore`
  - [ ] Initialize in constructor: `this.agent = new AgentStore()`
  - [ ] Re-initialize in `resetOnSignOut()`

---

## Phase 3: UI Components

### 3.1 Floating Action Button

- [ ] **3.1.1** Create `apps/web/core/components/agent/fab/index.tsx`
  - [ ] `FloatingAgentButton` observer component
  - [ ] Returns `null` if `user.currentUser` is falsy (not authenticated)
  - [ ] Returns `null` if `agent.config?.is_enabled` is false
  - [ ] Renders fixed-position button bottom-right
  - [ ] Uses `Bot` icon from `lucide-react`
  - [ ] Shows red badge with `agent.unreadCount` when > 0
  - [ ] Calls `agent.toggleChatWindow` on click

---

### 3.2 Chat Window Components

- [ ] **3.2.1** Create `apps/web/core/components/agent/chat-window/header.tsx`
  - [ ] `ChatWindowHeader` component with props: `workspaceSlug: string`
  - [ ] Shows "AI Agent" title
  - [ ] Shows "New Session" button — calls `agent.createSession(workspaceSlug)`
  - [ ] Shows close button `X` — calls `agent.closeChatWindow()`
  - [ ] Shows toggle for session history panel

- [ ] **3.2.2** Create `apps/web/core/components/agent/chat-window/session-list.tsx`
  - [ ] `SessionList` component
  - [ ] Shows list of `agent.sessions`
  - [ ] Each item shows title + date + last_message_preview
  - [ ] Clicking a session calls `agent.loadSession(workspaceSlug, session.id)`
  - [ ] Active session is highlighted
  - [ ] Shows a delete button per session calling `agentService.deleteSession()`

- [ ] **3.2.3** Create `apps/web/core/components/agent/chat-window/message-thread.tsx`
  - [ ] `MessageThread` component
  - [ ] Renders `agent.activeSessionMessages` in order
  - [ ] `role === "user"` → renders `<UserMessage>`
  - [ ] `role === "assistant"` → renders `<AssistantMessage>`
  - [ ] `role === "tool"` → renders `<ToolCallBlock>`
  - [ ] Shows typing indicator (3 dots animation) when `agent.isLoading`
  - [ ] Auto-scrolls to bottom on new messages (use `useEffect` + `scrollIntoView`)
  - [ ] Shows empty state text when no messages

- [ ] **3.2.4** Create `apps/web/core/components/agent/chat-window/index.tsx`
  - [ ] `ChatWindow` observer component
  - [ ] `useEffect` on `workspaceSlug`: fetch config, then fetch sessions, then load latest session
  - [ ] Returns `null` if `!agent.isOpen`
  - [ ] Renders fixed-position 420×600 panel bottom-right (above FAB)
  - [ ] Contains: `<ChatWindowHeader>`, `<SessionList>` (conditionally), `<MessageThread>`, `<ChatInputArea>`

---

### 3.3 Message Components

- [ ] **3.3.1** Create `apps/web/core/components/agent/messages/user-message.tsx`
  - [ ] `UserMessage({ message: IAgentChatMessage })`
  - [ ] Right-aligned bubble, primary color background, white text
  - [ ] Shows message content

- [ ] **3.3.2** Create `apps/web/core/components/agent/messages/assistant-message.tsx`
  - [ ] `AssistantMessage({ message: IAgentChatMessage })`
  - [ ] Left-aligned bubble, surface color
  - [ ] Renders `message.content` — if content is empty (tool-calling step), show nothing for text
  - [ ] Shows token count as faint metadata: `{tokens_sent}↑ {tokens_received}↓` if available
  - [ ] If `is_error`, shows red error styling

- [ ] **3.3.3** Create `apps/web/core/components/agent/messages/tool-call-block.tsx`
  - [ ] `ToolCallBlock({ message: IAgentChatMessage })`
  - [ ] Collapsed by default; click to expand
  - [ ] Shows tool name with `Wrench` icon
  - [ ] Expanded view shows: input JSON (pretty-printed), output JSON (pretty-printed)
  - [ ] Red `Error` label if `message.is_error`

---

### 3.4 Input Components

- [ ] **3.4.1** Create `apps/web/core/components/agent/input/send-button.tsx`
  - [ ] `SendButton({ onClick, disabled, isLoading })`
  - [ ] Shows spinner when `isLoading`
  - [ ] Shows `Send` arrow icon when not loading
  - [ ] Disabled when loading or text is empty

- [ ] **3.4.2** Create `apps/web/core/components/agent/input/model-selector.tsx`
  - [ ] `ModelSelector` observer component
  - [ ] Returns `null` if `agent.config?.available_models.length <= 1`
  - [ ] `<select>` element with model options from `agent.config.available_models`
  - [ ] Value bound to `agent.selectedModel`; onChange calls `agent.setSelectedModel`

- [ ] **3.4.3** Create `apps/web/core/components/agent/input/chat-input-area.tsx`
  - [ ] `ChatInputArea({ workspaceSlug: string })`
  - [ ] Multi-line `<textarea>` for message input
  - [ ] `Enter` submits (no shift-enter); `Shift+Enter` inserts newline
  - [ ] Submit calls `agent.sendMessage(workspaceSlug, content, projectId)` then clears input
  - [ ] Bottom row: `<ModelSelector>` on the left, `<SendButton>` on the right
  - [ ] Disabled while `agent.isLoading`

---

### 3.5 Barrel Exports & Layout Integration

- [ ] **3.5.1** Create `apps/web/core/components/agent/index.ts`
  - [ ] Export `FloatingAgentButton`, `ChatWindow`

- [ ] **3.5.2** Modify `apps/web/app/(all)/[workspaceSlug]/(projects)/layout.tsx`
  - [ ] Import `FloatingAgentButton` and `ChatWindow` from `@/components/agent`
  - [ ] Add `<FloatingAgentButton />` and `<ChatWindow />` after the main `<div>` wrapper
  - [ ] Ensure they are rendered outside the scrollable main area (after the border div)

---

## Phase 4: Settings Pages

### 4.1 Constants & Config

- [ ] **4.1.1** Update `packages/constants/src/settings/workspace.ts`
  - [ ] Add `"ai-agent"` key to `WORKSPACE_SETTINGS` object with correct `href`, `access` (ADMIN only), `i18n_label`
  - [ ] Add `WORKSPACE_SETTINGS["ai-agent"]` to `GROUPED_WORKSPACE_SETTINGS[FEATURES]` array

- [ ] **4.1.2** Update `packages/constants/src/settings/project.ts` (inspect first to understand format)
  - [ ] Add `"ai-agent"` entry to project settings constants
  - [ ] Scope to project ADMIN role

---

### 4.2 Workspace AI Agent Settings

- [ ] **4.2.1** Create `apps/web/core/components/settings/workspace/content/ai-agent-settings.tsx`
  - [ ] Component fetches config on mount: `agentService.getWorkspaceConfig(workspaceSlug)`
  - [ ] Form fields:
    - [ ] Provider: radio group — `openai` / `anthropic` / `gemini`
    - [ ] API Key: `<input type="password">` — shows placeholder `••••••••` if `api_key_set: true`; if user types a new value it will be saved; if left blank on save, existing key is kept
    - [ ] Model: `<select>` — populated from `config.available_models` (re-fetch on provider change)
    - [ ] Max Steps: `<input type="number" min=1 max=50>`
    - [ ] Reasoning Level: `<select>` — options: none / low / medium / high
    - [ ] Enable Agent: `<toggle>`
    - [ ] System Prompt: `<textarea rows=4>` — optional
  - [ ] Save button calls `agentService.saveWorkspaceConfig()` — only sends `api_key` if user typed one
  - [ ] Shows success/error toast using existing notification pattern in the codebase
  - [ ] Only renders for workspace ADMIN (check with `useUserPermissions`)

- [ ] **4.2.2** Create `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/ai-agent/page.tsx`
  - [ ] Import and render `<AIAgentSettings>` component

- [ ] **4.2.3** Create `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/ai-agent/header.tsx`
  - [ ] Renders page title "AI Agent"

- [ ] **4.2.4** Add sidebar icon for the AI Agent settings page
  - [ ] Update `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`
  - [ ] Add `"ai-agent": <Bot size={16} />` (import `Bot` from `lucide-react`)

---

### 4.3 Project AI Agent Settings

- [ ] **4.3.1** Create `apps/web/core/components/settings/project/content/ai-agent-settings.tsx`
  - [ ] Toggle at top: "Use workspace configuration" (default ON)
  - [ ] When ON: show workspace config fields read-only (fetched from workspace config endpoint)
  - [ ] When OFF: show editable project-specific form (same fields as workspace form)
  - [ ] Save calls `agentService.saveProjectConfig(workspaceSlug, projectId, data)`

- [ ] **4.3.2** Create route page and header at:
  - `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/ai-agent/page.tsx`
  - `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/ai-agent/header.tsx`

---

## Phase 5: Integration & Polishing

### 5.1 Context Awareness

- [ ] **5.1.1** Pass current `projectId` from URL params to the agent
  - [ ] In `ChatInputArea`, use `useParams()` to read `projectId` if present
  - [ ] Pass to `agent.sendMessage(workspaceSlug, content, projectId)`

- [ ] **5.1.2** Auto-title sessions on first message
  - [ ] In `AgentService.run()`, if `session.title` is empty, set it to first 60 chars of user message after creating the user `AgentChatMessage`

---

### 5.2 Error Handling

- [ ] **5.2.1** Handle `AgentDisabledError` in chat view → return `403`
- [ ] **5.2.2** Handle LLM errors in `call_llm()` — `any_llm` exceptions (`AuthenticationError`, `MissingApiKeyError`, `RateLimitError`, `ContextLengthExceededError`, `ProviderError`) are each caught and re-raised as `ValueError` with human-readable messages; verify they propagate through `AgentService.run()` to the chat view
- [ ] **5.2.4** In frontend: show inline error message in chat when `sendMessage()` throws
- [ ] **5.2.5** In frontend: handle `config.is_enabled = false` — hide FAB and show disabled message in settings

---

### 5.3 Security Audit

- [ ] **5.3.1** Verify every agent endpoint returns `401` for anonymous requests (write a test)
- [ ] **5.3.2** Verify `api_key` field is never present in any GET response (write a test)
- [ ] **5.3.3** Verify session ownership check — user A cannot read/write user B's sessions (write a test)
- [ ] **5.3.4** Verify tool execution uses `request_user`'s permissions, not superuser (write a test for Guest role)
- [ ] **5.3.5** Verify FAB is not rendered in the DOM when user is not authenticated (manual + E2E)

---

### 5.4 Performance

- [ ] **5.4.1** Add pagination to session list — return 20 sessions per page
- [ ] **5.4.2** Add message index `(session_id, created_at)` — already in model definition, confirm it's in the migration
- [ ] **5.4.3** Use `select_related("workspace", "user")` on session queries to avoid N+1

---

### 5.5 i18n

- [ ] **5.5.1** Add translation keys for all new UI strings (follow existing pattern in `packages/i18n`)
  - [ ] `workspace_settings.settings.ai_agent.title`
  - [ ] `agent.chat.placeholder`
  - [ ] `agent.chat.empty_state`
  - [ ] `agent.chat.new_session`
  - [ ] `agent.chat.typing`
  - [ ] `agent.settings.provider`
  - [ ] `agent.settings.api_key`
  - [ ] `agent.settings.model`
  - [ ] `agent.settings.max_steps`
  - [ ] `agent.settings.reasoning_level`
  - [ ] `agent.settings.enable`
  - [ ] `agent.settings.system_prompt`

---

## Phase 6: Testing & QA

### 6.1 Backend Tests (pytest)

- [ ] **6.1.1** Run existing test suite — confirm no regressions: `pnpm turbo run test --filter=api`
- [ ] **6.1.2** Run new agent unit tests: `pytest apps/api/plane/tests/agent/ -v`
- [ ] **6.1.3** Check migration applies cleanly on fresh DB

### 6.2 Frontend Tests (vitest)

- [ ] **6.2.1** Write unit tests for `AgentStore`
  - [ ] Test `toggleChatWindow` sets `isOpen` and clears `unreadCount`
  - [ ] Test `sendMessage` adds optimistic message then replaces with real ones
  - [ ] Test `setSelectedModel` updates observable

- [ ] **6.2.2** Write component tests for `FloatingAgentButton`
  - [ ] Renders nothing when `user.currentUser` is null
  - [ ] Renders nothing when `config.is_enabled` is false
  - [ ] Shows badge when `unreadCount > 0`

- [ ] **6.2.3** Run frontend type check: `pnpm check:types`
- [ ] **6.2.4** Run frontend lint: `pnpm check:lint`

### 6.3 Manual QA Checklist

- [ ] FAB is visible after login on workspace page
- [ ] FAB is not visible when logged out
- [ ] Clicking FAB opens chat window
- [ ] Typing a message and sending shows the message + agent response
- [ ] Tool calls appear as collapsible blocks
- [ ] Expanding a tool call shows input and output JSON
- [ ] Reloading the page restores the chat history
- [ ] Switching to a new session clears the thread
- [ ] Model selector shows correct models for configured provider
- [ ] Changing model in selector affects next message
- [ ] Workspace AI Agent settings page saves config
- [ ] API key shows `••••` placeholder after first save
- [ ] Project AI Agent settings page works with workspace override toggle
- [ ] FAB disappears when agent is disabled via settings toggle

---

## Completion Checklist

- [ ] All Phase 1 tasks complete (Backend)
- [ ] All Phase 2 tasks complete (Frontend foundation)
- [ ] All Phase 3 tasks complete (UI components)
- [ ] All Phase 4 tasks complete (Settings pages)
- [ ] All Phase 5 tasks complete (Integration)
- [ ] All Phase 6 tests passing
- [ ] `pnpm check` passes with no new errors
- [ ] Documentation in `docs/agent/` reviewed and up to date
- [ ] PR description references all changed files listed in `design.md` section 12
