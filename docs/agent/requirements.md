# Requirements: Plane AI Agent Chat Feature

**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** Draft

---

## 1. Overview

Add an AI agent chat interface to Plane that allows authenticated users to interact with a conversational AI that can read and act upon the Plane workspace — creating, editing, and moving work items, modules, cycles, and more — all via a persistent, auditable chat thread.

---

## 2. Scope

### 2.1 In Scope

- Floating action button (FAB) that opens a chat window
- Persistent chat window with full conversation history
- Model selector in the chat window UI
- Agent configurator section in both workspace settings and project settings
- Backend agent service with multi-step agentic loop
- Tool definitions exposing Plane functionality to the agent
- Full persistence of chat history, tool calls, tool results, and token usage
- Authentication and authorization enforcement on all agent endpoints

### 2.2 Out of Scope (v1)

- File / image attachments in chat
- Voice input
- Real-time streaming responses (may be added in v1.1)
- Multi-agent collaboration
- Scheduled/automated agent runs (no cron triggers)
- Public/unauthenticated agent access
- Agent-to-agent communication

---

## 3. User Stories

### 3.1 Chat Interface

| ID    | Story                                                                                                                                              | Priority |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| US-01 | As an authenticated user, I can see a floating action button (FAB) on any page within a workspace so I can open the agent chat at any time.        | P0       |
| US-02 | As a user, I can open a chat window by clicking the FAB and type messages to the agent.                                                            | P0       |
| US-03 | As a user, the chat window persists its history across page reloads and navigation within the workspace.                                           | P0       |
| US-04 | As a user, I can select which AI model to use from a dropdown next to the send button, choosing from models available for the configured provider. | P0       |
| US-05 | As a user, I can see which tools the agent invoked during a response, including their inputs and outputs, collapsed by default.                    | P1       |
| US-06 | As a user, I can scroll through past conversation history and start a new chat session.                                                            | P1       |
| US-07 | As a user, I can close the chat window and reopen it without losing the current session.                                                           | P0       |

### 3.2 Agent Capabilities

| ID    | Story                                                                                                | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| US-08 | As a user, I can ask the agent to list, create, update, or delete work items in the current project. | P0       |
| US-09 | As a user, I can ask the agent to create or update cycles and modules in the current project.        | P0       |
| US-10 | As a user, I can ask the agent to move work items between cycles, modules, or projects.              | P0       |
| US-11 | As a user, I can ask the agent to search across the workspace for items matching criteria.           | P0       |
| US-12 | As a user, I can ask the agent about the current project's states, labels, and members.              | P0       |
| US-13 | As a user, I can ask the agent to add comments to work items.                                        | P1       |
| US-14 | As an admin, I can configure the agent to have workspace-wide access (not just the current project). | P1       |

### 3.3 Agent Configuration

| ID    | Story                                                                                                                                                         | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| US-15 | As a workspace admin, I can navigate to workspace settings > AI Agent and configure the LLM provider, API key, default model, max steps, and reasoning level. | P0       |
| US-16 | As a project admin, I can navigate to project settings > AI Agent and override the workspace-level configuration for that project specifically.               | P1       |
| US-17 | As an admin, the API key is stored encrypted and never returned in plain text via any API response.                                                           | P0       |
| US-18 | As an admin, I can enable or disable the agent feature at the workspace or project level.                                                                     | P0       |
| US-19 | As an admin, I can set a custom system prompt to guide the agent's behavior.                                                                                  | P2       |

### 3.4 Persistence & Audit

| ID    | Story                                                                                                                | Priority |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| US-20 | The system must persist every user message, agent response, tool call request, and tool call result to the database. | P0       |
| US-21 | The system must record the number of tokens sent, received, and used for reasoning per LLM call.                     | P0       |
| US-22 | When I reload the browser, my chat history is fetched from the server and restored.                                  | P0       |
| US-23 | Chat sessions are scoped per user per workspace (optionally per project).                                            | P0       |

### 3.5 Security

| ID    | Story                                                                                                                                                         | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| US-24 | The FAB is only visible to authenticated users.                                                                                                               | P0       |
| US-25 | All agent API endpoints return `401 Unauthorized` for unauthenticated requests.                                                                               | P0       |
| US-26 | All agent API endpoints return `403 Forbidden` for authenticated users who do not have workspace membership.                                                  | P0       |
| US-27 | Agent tool execution respects the calling user's existing Plane permissions — the agent cannot perform actions the user is not allowed to perform themselves. | P0       |
| US-28 | API keys stored in `AgentConfiguration` must be encrypted at rest using the existing encryption utility.                                                      | P0       |

---

## 4. Functional Requirements

### 4.1 Floating Action Button (FAB)

- **FR-01:** The FAB is rendered as a fixed-position element in the bottom-right corner of the workspace layout.
- **FR-02:** The FAB is only rendered when the user is authenticated and is a member of the current workspace.
- **FR-03:** Clicking the FAB toggles the chat window open/closed.
- **FR-04:** The FAB shows an unread-indicator badge if the agent has responded while the window was closed.
- **FR-05:** The FAB is hidden if the agent feature is disabled at the workspace level.

### 4.2 Chat Window

- **FR-06:** The chat window is a non-blocking popup panel (does not replace the main content).
- **FR-07:** The window shows a chronological thread of messages: user messages, agent text responses, and collapsible tool call blocks.
- **FR-08:** The window has a text input area at the bottom with a send button.
- **FR-09:** The model selector dropdown is positioned to the left of the send button within the input area.
- **FR-10:** The window has a "New Session" button to start a fresh conversation.
- **FR-11:** The window has a session history list accessible via a sidebar/toggle so users can navigate to past sessions.
- **FR-12:** The window displays a loading indicator (typing animation) while the agent is processing.
- **FR-13:** Error messages from the agent or backend are displayed inline in the chat thread.

### 4.3 Model Selector

- **FR-14:** The model list is populated from the configured provider's supported models as returned by the backend config endpoint.
- **FR-15:** The selector shows the currently active model; the default is the admin-configured model.
- **FR-16:** Model selection is persisted in the session for the duration of the chat.
- **FR-17:** The selector is disabled if only one model is available.

### 4.4 Agent Configuration — Workspace Settings

- **FR-18:** Workspace settings gains a new "AI Agent" section in the sidebar under "Features" category.
- **FR-19:** The configuration form includes:
  - Provider (`openai` / `anthropic` / `gemini`)
  - API Key (password-type input; shows masked value if already set)
  - Model (dropdown, populated from provider's model list)
  - Max Steps (integer 1–50, default 10)
  - Reasoning Level (`none` / `low` / `medium` / `high` — maps to provider-specific parameters)
  - Enable Agent (toggle)
  - Custom System Prompt (textarea, optional)
- **FR-20:** Save is gated to workspace ADMIN role.
- **FR-21:** The API key is sent to the backend over HTTPS and is stored encrypted. It is never returned in a GET response (omit or mask).

### 4.5 Agent Configuration — Project Settings

- **FR-22:** Project settings gains a new "AI Agent" section.
- **FR-23:** The project config form includes the same fields as workspace config.
- **FR-24:** An additional toggle "Use workspace configuration" collapses the form and defers to the workspace config (default: ON).
- **FR-25:** Save is gated to project ADMIN role.

### 4.6 Backend Agent Service

- **FR-26:** A new `agent` Django app is created at `apps/api/plane/agent/`.
- **FR-27:** The service implements a multi-step agentic loop:
  1. Receive user message.
  2. Load chat history for the session.
  3. Call LLM with system prompt + history + tool definitions.
  4. If LLM returns tool calls: execute each tool, persist tool call + result, append to history, loop.
  5. If LLM returns a final text message: persist and return.
  6. Enforce `max_steps` to prevent infinite loops.
- **FR-28:** Tool execution runs with the requesting user's identity so permissions are respected.
- **FR-29:** The agentic loop is synchronous in v1 (no Celery). Response is held open until the turn completes. Max steps × max latency per step must complete within the reverse-proxy timeout (recommend setting max_steps default to 10 with ≤30s total timeout).

### 4.7 Agent Tools

The following tools are exposed to the agent. All tools are scoped to the current workspace. By default, project-scoped tools operate on the `active_project_id` embedded in the system prompt unless the user specifies a different project.

| Tool Name                  | Description                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `list_work_items`          | List work items with optional filters (project, state, priority, assignee, label, query) |
| `get_work_item`            | Get details of a specific work item by ID or identifier (e.g. "PROJ-123")                |
| `create_work_item`         | Create a new work item in a project                                                      |
| `update_work_item`         | Update fields on an existing work item                                                   |
| `delete_work_item`         | Delete a work item                                                                       |
| `add_work_item_comment`    | Add a comment to a work item                                                             |
| `list_cycles`              | List cycles in a project                                                                 |
| `get_cycle`                | Get cycle details                                                                        |
| `create_cycle`             | Create a cycle                                                                           |
| `update_cycle`             | Update a cycle                                                                           |
| `add_issues_to_cycle`      | Add one or more work items to a cycle                                                    |
| `remove_issue_from_cycle`  | Remove a work item from a cycle                                                          |
| `list_modules`             | List modules in a project                                                                |
| `get_module`               | Get module details                                                                       |
| `create_module`            | Create a module                                                                          |
| `update_module`            | Update a module                                                                          |
| `add_issues_to_module`     | Add one or more work items to a module                                                   |
| `remove_issue_from_module` | Remove a work item from a module                                                         |
| `list_states`              | List states in a project                                                                 |
| `list_labels`              | List labels in a project                                                                 |
| `list_members`             | List members of a project or workspace                                                   |
| `list_projects`            | List all projects in the workspace the user can access                                   |
| `search`                   | Search across workspace entities (work items, cycles, modules, pages)                    |

### 4.8 Persistence Requirements

- **FR-30:** `AgentConfiguration` — stores LLM config per workspace (or per project as an override). API key encrypted.
- **FR-31:** `AgentChatSession` — one record per user per conversation. Scoped to workspace and optionally project.
- **FR-32:** `AgentChatMessage` — one record per message in the thread. Stores: role (user/assistant/tool), content, tool call metadata, tool result, model used, tokens in, tokens out, reasoning tokens, step index, latency.
- **FR-33:** Messages are loaded in `created_at` order on session fetch.
- **FR-34:** Sessions are loaded most-recent-first for the session history list.

---

## 5. Non-Functional Requirements

| ID     | Requirement                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | All agent API endpoints enforce `IsAuthenticated` + workspace membership. Anonymous requests receive `401`.                           |
| NFR-02 | The FAB and chat window are only rendered client-side after the user's session is verified.                                           |
| NFR-03 | API keys are encrypted using the existing `plane.license.utils.encryption` module before storage.                                     |
| NFR-04 | The agentic loop must complete within 60 seconds; individual LLM calls should time out at 30 seconds.                                 |
| NFR-05 | The agent must never execute a tool on behalf of a user for an action that user's role would not permit directly.                     |
| NFR-06 | All new code must follow the existing code style: TypeScript strict mode, MobX reactive stores, OxLint, oxfmt.                        |
| NFR-07 | All new endpoints follow the existing URL conventions: `/api/workspaces/<slug>/agent/...`.                                            |
| NFR-08 | Database migrations must be additive (no destructive changes to existing tables).                                                     |
| NFR-09 | The feature is enabled/disabled via the `AgentConfiguration.is_enabled` flag; disabled means no FAB rendered, endpoints return `403`. |
| NFR-10 | Chat history fetch on page reload must complete in < 500ms for sessions with up to 100 messages.                                      |

---

## 6. Acceptance Criteria

| Criterion                       | Verification                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FAB invisible when logged out   | Manual + E2E: visit workspace page without session, assert FAB not present in DOM                    |
| FAB visible when logged in      | Manual + E2E: log in, navigate to workspace, assert FAB rendered                                     |
| Chat history persists on reload | E2E: send message, reload page, assert message still visible                                         |
| Tool call persisted to DB       | Integration test: send message that triggers tool, query `AgentChatMessage` table for tool role rows |
| Token usage recorded            | Integration test: assert `tokens_sent > 0` on assistant message rows                                 |
| API key masked in GET           | API test: POST config with key, GET config, assert key field is masked/absent                        |
| Unauthorized returns 401        | API test: call `/api/workspaces/<slug>/agent/...` without session, assert 401                        |
| Config saves for ADMIN only     | API test: attempt save as MEMBER role, assert 403                                                    |
| Max steps enforced              | Unit test: mock LLM to always return tool calls, assert loop terminates at max_steps                 |
| Agent respects user permissions | Integration test: agent attempts to delete an issue as a Guest user, assert 403 propagated           |
