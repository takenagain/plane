# Agent Provider Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unsupported model/reasoning/tool configurations from being saved, surface provider failures in chat, and document remediation for the other warnings observed in production.

**Architecture:** The backend model catalog will expose a `supports_reasoning_with_tools` capability and provide the authoritative compatibility check used by serializer validation. A shared frontend helper will consume the same public metadata so workspace and project settings render the same inline error and disable saving. Provider-call exceptions will be normalized into persisted assistant error messages, while the chat store will retain HTTP errors after reconciling the session.

**Tech Stack:** Django REST Framework, Python dataclasses/pytest, React/TypeScript, MobX, Vitest/Testing Library, Markdown.

## Global Constraints

- Enforce compatibility generically from model capability metadata across both workspace and project settings.
- GPT-5.6 Luna is incompatible only when Plane's function tools are combined with a reasoning level other than `none` on the current Chat Completions integration.
- Never expose API keys or other request secrets in provider error messages.
- Preserve unrelated working-tree files and changes.
- Do not commit or push until the relevant backend suite, web unit suite, and full E2E suite have passed in this session.

---

### Task 1: Model capability validation

**Files:**

- Modify: `apps/api/plane/agent/catalog.py`
- Modify: `apps/api/plane/agent/serializers/configuration.py`
- Modify: `packages/types/src/agent.ts`
- Create: `apps/web/core/components/settings/agent-config-validation.ts`
- Modify: `apps/web/core/components/settings/workspace/content/ai-agent-settings.tsx`
- Modify: `apps/web/core/components/settings/project/content/ai-agent-settings.tsx`
- Test: `apps/api/plane/tests/agent/test_catalog.py`
- Test: `apps/api/plane/tests/agent/test_configuration.py`
- Test: `apps/web/core/components/settings/workspace/content/__tests__/ai-agent-settings.test.tsx`
- Test: `apps/web/core/components/settings/project/content/__tests__/ai-agent-settings.test.tsx`

**Interfaces:**

- Produces: public `IAgentModel.supports_reasoning_with_tools: boolean`.
- Produces: backend `get_model_configuration_error(provider: str, model_id: str, reasoning_level: str) -> str | None`.
- Produces: frontend `getAgentModelConfigurationError(model: IAgentModel | undefined, reasoningLevel: IAgentConfig["reasoning_level"]) -> string | null`.
- Consumes: provider catalog responses already returned by workspace/project settings endpoints.

- [ ] **Step 1: Add failing backend catalog and serializer tests**

  Add assertions that Luna publishes `supports_reasoning_with_tools: false`, normal models publish `true`, and a workspace config POST with Luna plus `medium` reasoning returns HTTP 400 without persisting the invalid combination. Add the control case that Luna plus `none` is accepted.

- [ ] **Step 2: Run the focused backend tests and verify RED**

  Run: `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/agent/test_catalog.py plane/tests/agent/test_configuration.py -q`

  Expected: failures because the capability field and compatibility validation do not exist.

- [ ] **Step 3: Implement backend capability metadata and validation**

  Add `supports_reasoning_with_tools: bool = True` to `ModelDefinition`, keep `reasoning_mode` internal, set Luna to `False`, and implement a catalog compatibility function returning this error for an incompatible combination:

  ```text
  GPT-5.6 Luna does not support reasoning together with the function tools used by Plane. Set Reasoning to none or choose another model.
  ```

  Call the compatibility function from `AgentConfigSerializer.validate` after resolving partial-update values.

- [ ] **Step 4: Run the focused backend tests and verify GREEN**

  Run the same focused Docker pytest command from Step 2.

  Expected: all selected tests pass.

- [ ] **Step 5: Add failing settings tests**

  Extend both provider fixtures with Luna capability metadata. In each settings test, select Luna while reasoning is `medium`, then assert the inline compatibility error is visible and the save button is disabled; change reasoning to `none` and assert the error disappears and save becomes available subject to the page's existing API-key rules.

- [ ] **Step 6: Run focused web tests and verify RED**

  Run: `pnpm --filter=web test:unit -- apps/web/core/components/settings/workspace/content/__tests__/ai-agent-settings.test.tsx apps/web/core/components/settings/project/content/__tests__/ai-agent-settings.test.tsx`

  Expected: failures because the UI does not consume capability metadata.

- [ ] **Step 7: Implement shared frontend validation and both settings guards**

  Add the capability field to `IAgentModel`, implement the shared helper, compute the selected model definition/error in both pages, render the error with `role="alert"`, return early from both save handlers, and include the error in each save button's disabled condition.

- [ ] **Step 8: Run focused web tests and verify GREEN**

  Run the same focused Vitest command from Step 6.

  Expected: all selected tests pass.

### Task 2: Visible provider errors in chat

**Files:**

- Modify: `apps/api/plane/agent/service/llm.py`
- Test: `apps/api/plane/tests/agent/test_llm.py`
- Test: `apps/api/plane/tests/agent/test_loop.py`
- Modify: `apps/web/core/store/agent/agent.store.ts`
- Test: `apps/web/core/store/agent/__tests__/agent.store.test.ts`

**Interfaces:**

- Produces: provider-call failures as safe `ValueError` messages containing the provider response detail.
- Consumes: the existing loop behavior that persists `ValueError` as an assistant message with `is_error=True`.
- Produces: `AgentStore.error` remains set when an HTTP send failure is followed by a successful session refresh.

- [ ] **Step 1: Add failing backend provider-error tests**

  Add a `call_llm` test whose fake provider raises a raw SDK-style exception containing a safe provider validation detail and assert it becomes `ValueError("Provider error from 'openai': …")`. Add a loop test asserting that this normalized failure creates and returns an assistant `is_error` message.

- [ ] **Step 2: Run focused backend tests and verify RED**

  Run: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/agent/test_llm.py plane/tests/agent/test_loop.py -q`

  Expected: the raw exception escapes instead of becoming a visible assistant error.

- [ ] **Step 3: Normalize unexpected provider-call exceptions**

  Keep the existing specific authentication/rate-limit/context mappings. In the final exception branch around `llm.completion`, log the exception, strip line breaks from its text, cap the displayed detail to a bounded length, and raise `ValueError` with a provider-prefixed message. Use a generic fallback when the exception has no text.

- [ ] **Step 4: Run focused backend tests and verify GREEN**

  Run the same focused Docker pytest command from Step 2.

  Expected: all selected tests pass.

- [ ] **Step 5: Add a failing chat-store regression test**

  Extend the service fake with `sendMessage`. Reject it with `new Error("Provider error from 'openai': request rejected")`, let `getSession` resolve to the persisted server history, call `store.sendMessage`, and assert both that history is reconciled and that `store.error` still contains the provider error.

- [ ] **Step 6: Run the focused store test and verify RED**

  Run: `pnpm --filter=web test:unit -- apps/web/core/store/agent/__tests__/agent.store.test.ts`

  Expected: `store.error` is `null` because `loadSession` clears it.

- [ ] **Step 7: Preserve the HTTP error after session reconciliation**

  In the `sendMessage` catch branch, capture the error message, reconcile the session first, then set `this.error` after the refresh attempt. Keep optimistic-message cleanup for refresh failures.

- [ ] **Step 8: Run the focused store test and verify GREEN**

  Run the same focused Vitest command from Step 6.

  Expected: all selected tests pass.

### Task 3: Production warning remediation report

**Files:**

- Create: `docs/operations/production-errors-and-warnings-remediation.md`

**Interfaces:**

- Consumes: warnings observed in the Plane production containers on 2026-08-01.
- Produces: an operator-facing severity, remediation, rollout caveat, and verification procedure for each warning.

- [ ] **Step 1: Write the report from observed evidence and primary documentation**

  Cover the stale `plane.license.bgtasks.tracer.instance_traces` periodic task, insecure placeholder `SECRET_KEY`, root Celery workers, Valkey `vm.overcommit_memory`, Valkey default-config notice, RabbitMQ recovery/deprecated features/connection recreation, and expected Caddy cleartext HTTP/2/3 notices. Include non-destructive inspection commands before any mutating command and state which changes can invalidate sessions or require a restart.

- [ ] **Step 2: Review report safety and completeness**

  Verify no secret values, credentials, destructive broad commands, or unsupported assumptions appear. Confirm each observed warning is classified as immediate, planned, or informational and links to an authoritative source where available.

### Task 4: Full verification

**Files:**

- Verify all modified files.

**Interfaces:**

- Consumes: completed Tasks 1–3.
- Produces: evidence that the changed backend, frontend, and integration behavior pass repository-required checks.

- [ ] **Step 1: Run formatting, lint, and type checks for changed areas**

  Run: `pnpm exec oxfmt --check packages/types/src/agent.ts apps/web/core/components/settings/agent-config-validation.ts apps/web/core/components/settings/workspace/content/ai-agent-settings.tsx apps/web/core/components/settings/project/content/ai-agent-settings.tsx apps/web/core/store/agent/agent.store.ts`

  Run: `pnpm --filter=web check:types`

- [ ] **Step 2: Run the full backend test stack**

  Run: `docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests`

  Expected: pytest exits 0.

- [ ] **Step 3: Run the complete web unit suite**

  Run: `pnpm --filter=web test:unit`

  Expected: Vitest exits 0.

- [ ] **Step 4: Run the complete E2E suite against the local stack**

  Ensure the local stack is running with `docker compose -f docker-compose-local.yml -p wrrw-e2e up -d --build`, then run `pnpm test:e2e`.

  Expected: Playwright exits 0.

- [ ] **Step 5: Inspect the final diff and working tree**

  Run: `git diff --check`, `git diff --stat`, and `git status --short`.

  Confirm `.codegraph/daemon.pid`, `.claude/settings.local.json`, and `docs/investigations/pages-wiki-e2e-results.json` remain untouched and unstaged.
