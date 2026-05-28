# Current State: System Interfaces Available for Agent Tools

> Audit of the Plane codebase as of 2026-05-27.  
> Covers the backend REST API surface and frontend service layer that can be wrapped as agent tools.

---

## 1. Existing LLM / AI Integration

### 1.1 Backend endpoints

| Endpoint                                                         | View                              | Method | Auth                               |
| ---------------------------------------------------------------- | --------------------------------- | ------ | ---------------------------------- |
| `/api/workspaces/<slug>/projects/<project_id>/ai-assistant/`     | `GPTIntegrationEndpoint`          | `POST` | Session + ADMIN/MEMBER             |
| `/api/workspaces/<slug>/ai-assistant/`                           | `WorkspaceGPTIntegrationEndpoint` | `POST` | Session + ADMIN/MEMBER (workspace) |
| `/api/workspaces/<slug>/projects/<project_id>/rephrase-grammar/` | (similar pattern)                 | `POST` | Session                            |

**File:** `apps/api/plane/app/views/external/base.py`

**Capability today:** Single-turn prompt → text response only. No tool calling. No history. No streaming. Reads LLM config from `InstanceConfiguration` (global admin-set).

**LLM providers defined:** `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` (all providers are called via the OpenAI SDK client — Anthropic/Gemini via proxy is untested in current code).

### 1.2 Frontend AI service

**File:** `apps/web/core/services/ai.service.ts`

```ts
AIService.createGptTask(workspaceSlug, { prompt, task })
AIService.performEditorTask(workspaceSlug, data: TTaskPayload)
```

Used for AI text editing (rephrase, grammar). No chat sessions, no history.

---

## 2. REST API Surface: Agent-Exposable Endpoints

All endpoints below require `IsAuthenticated` (session) via `BaseSessionAuthentication`. Role-gated via `ProjectEntityPermission`, `ProjectMemberPermission`, or `allow_permission` decorator.

### 2.1 Work Items (Issues)

**File:** `apps/api/plane/app/urls/issue.py`

| Operation           | HTTP      | URL Pattern                                                              |
| ------------------- | --------- | ------------------------------------------------------------------------ |
| List issues         | GET       | `/workspaces/<slug>/projects/<project_id>/issues/`                       |
| Create issue        | POST      | `/workspaces/<slug>/projects/<project_id>/issues/`                       |
| Retrieve issue      | GET       | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/`            |
| Update issue        | PUT/PATCH | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/`            |
| Delete issue        | DELETE    | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/`            |
| Paginated list (v2) | GET       | `/workspaces/<slug>/projects/<project_id>/v2/issues/`                    |
| Detail endpoint     | GET       | `/workspaces/<slug>/projects/<project_id>/issues-detail/`                |
| Bulk delete         | DELETE    | `/workspaces/<slug>/projects/<project_id>/bulk-delete-issues/`           |
| Bulk archive        | POST      | `/workspaces/<slug>/projects/<project_id>/bulk-archive-issues/`          |
| Bulk update dates   | POST      | `/workspaces/<slug>/projects/<project_id>/issue-dates/`                  |
| Sub-issues          | GET/POST  | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/sub-issues/` |
| Issue by identifier | GET       | `/workspaces/<slug>/work-items/<project_identifier>-<issue_identifier>/` |

**Issue model fields (key):** `name`, `description_html`, `description_json`, `priority` (urgent/high/medium/low/none), `state`, `assignees`, `labels`, `start_date`, `target_date`, `parent`, `type`, `estimate_point`, `is_draft`, `sequence_id`, `sort_order`

#### Issue Relations

| Operation             | HTTP     | URL Pattern                                                                   |
| --------------------- | -------- | ----------------------------------------------------------------------------- |
| List/Create relations | GET/POST | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/issue-relation/`  |
| Remove relation       | POST     | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/remove-relation/` |

#### Issue Comments

| Operation     | HTTP         | URL Pattern                                                                 |
| ------------- | ------------ | --------------------------------------------------------------------------- |
| List/Create   | GET/POST     | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/comments/`      |
| Update/Delete | PATCH/DELETE | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/comments/<pk>/` |

#### Issue Labels

| Operation   | HTTP     | URL Pattern                                                    |
| ----------- | -------- | -------------------------------------------------------------- |
| List/Create | GET/POST | `/workspaces/<slug>/projects/<project_id>/issue-labels/`       |
| Bulk create | POST     | `/workspaces/<slug>/projects/<project_id>/bulk-create-labels/` |

#### Issue Activity / History

| Operation   | HTTP | URL Pattern                                                           |
| ----------- | ---- | --------------------------------------------------------------------- |
| Get history | GET  | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/history/` |

#### Issue Archive

| Operation     | HTTP   | URL Pattern                                                     |
| ------------- | ------ | --------------------------------------------------------------- |
| List archived | GET    | `/workspaces/<slug>/projects/<project_id>/archived-issues/`     |
| Archive       | POST   | `/workspaces/<slug>/projects/<project_id>/issues/<pk>/archive/` |
| Unarchive     | DELETE | `/workspaces/<slug>/projects/<project_id>/issues/<pk>/archive/` |

### 2.2 Cycles

**File:** `apps/api/plane/app/urls/cycle.py`

| Operation              | HTTP                 | URL Pattern                                                                           |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| List/Create            | GET/POST             | `/workspaces/<slug>/projects/<project_id>/cycles/`                                    |
| Retrieve/Update/Delete | GET/PUT/PATCH/DELETE | `/workspaces/<slug>/projects/<project_id>/cycles/<pk>/`                               |
| List/Add cycle issues  | GET/POST             | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/cycle-issues/`            |
| Remove cycle issue     | DELETE               | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/cycle-issues/<issue_id>/` |
| Transfer issues        | POST                 | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/transfer-issues/`         |
| Date check             | GET                  | `/workspaces/<slug>/projects/<project_id>/cycles/date-check/`                         |
| Progress               | GET                  | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/progress/`                |
| Analytics              | GET                  | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/analytics/`               |
| Archive/Unarchive      | POST/DELETE          | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/archive/`                 |

**Cycle model fields:** `name`, `description`, `start_date`, `end_date`, `owned_by`, `status`, `progress_snapshot`

### 2.3 Modules

**File:** `apps/api/plane/app/urls/module.py`

| Operation              | HTTP                 | URL Pattern                                                                       |
| ---------------------- | -------------------- | --------------------------------------------------------------------------------- |
| List/Create            | GET/POST             | `/workspaces/<slug>/projects/<project_id>/modules/`                               |
| Retrieve/Update/Delete | GET/PUT/PATCH/DELETE | `/workspaces/<slug>/projects/<project_id>/modules/<pk>/`                          |
| List/Add module issues | GET/POST             | `/workspaces/<slug>/projects/<project_id>/modules/<module_id>/issues/`            |
| Add issue to modules   | POST                 | `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/modules/`             |
| Remove module issue    | DELETE               | `/workspaces/<slug>/projects/<project_id>/modules/<module_id>/issues/<issue_id>/` |
| Transfer module issues | POST                 | `/workspaces/<slug>/projects/<project_id>/modules/<module_id>/transfer/`          |
| Archive/Unarchive      | POST/DELETE          | `/workspaces/<slug>/projects/<project_id>/modules/<module_id>/archive/`           |

**Module model fields:** `name`, `description`, `start_date`, `target_date`, `status` (backlog/planned/in-progress/paused/completed/cancelled), `lead`, `members`

### 2.4 States

**File:** `apps/api/plane/app/urls/state.py`

| Operation              | HTTP             | URL Pattern                                                          |
| ---------------------- | ---------------- | -------------------------------------------------------------------- |
| List/Create            | GET/POST         | `/workspaces/<slug>/projects/<project_id>/states/`                   |
| Retrieve/Update/Delete | GET/PATCH/DELETE | `/workspaces/<slug>/projects/<project_id>/states/<pk>/`              |
| Mark default           | POST             | `/workspaces/<slug>/projects/<project_id>/states/<pk>/mark-default/` |

### 2.5 Labels

| Operation        | HTTP         | URL Pattern                                                    |
| ---------------- | ------------ | -------------------------------------------------------------- |
| List/Create      | GET/POST     | `/workspaces/<slug>/projects/<project_id>/issue-labels/`       |
| Update/Delete    | PATCH/DELETE | `/workspaces/<slug>/projects/<project_id>/issue-labels/<pk>/`  |
| Bulk create      | POST         | `/workspaces/<slug>/projects/<project_id>/bulk-create-labels/` |
| Workspace labels | GET          | `/workspaces/<slug>/labels/`                                   |

### 2.6 Projects

**File:** `apps/api/plane/app/urls/project.py`

| Operation              | HTTP             | URL Pattern                                         |
| ---------------------- | ---------------- | --------------------------------------------------- |
| List/Create            | GET/POST         | `/workspaces/<slug>/projects/`                      |
| Retrieve/Update/Delete | GET/PATCH/DELETE | `/workspaces/<slug>/projects/<pk>/`                 |
| Archive/Unarchive      | POST/DELETE      | `/workspaces/<slug>/projects/<project_id>/archive/` |
| Members                | GET/POST         | `/workspaces/<slug>/projects/<project_id>/members/` |

### 2.7 Workspace-level Reads

**File:** `apps/api/plane/app/urls/workspace.py`

| Operation             | HTTP | URL Pattern                                 |
| --------------------- | ---- | ------------------------------------------- |
| List workspace issues | GET  | `/workspaces/<slug>/user-issues/<user_id>/` |
| All modules           | GET  | `/workspaces/<slug>/modules/`               |
| All cycles            | GET  | `/workspaces/<slug>/cycles/`                |
| All states            | GET  | `/workspaces/<slug>/states/`                |
| All labels            | GET  | `/workspaces/<slug>/labels/`                |
| Members               | GET  | `/workspaces/<slug>/members/`               |

### 2.8 Search

**File:** `apps/api/plane/app/urls/search.py`

| Operation            | HTTP | URL Pattern                                               |
| -------------------- | ---- | --------------------------------------------------------- |
| Global search        | GET  | `/workspaces/<slug>/search/?query=...`                    |
| Project issue search | GET  | `/workspaces/<slug>/projects/<project_id>/search-issues/` |
| Entity search        | GET  | `/workspaces/<slug>/entity-search/`                       |

### 2.9 Pages

| Operation              | HTTP             | URL Pattern                                            |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| List/Create            | GET/POST         | `/workspaces/<slug>/projects/<project_id>/pages/`      |
| Retrieve/Update/Delete | GET/PATCH/DELETE | `/workspaces/<slug>/projects/<project_id>/pages/<pk>/` |

### 2.10 Analytics

| Operation       | HTTP     | URL Pattern                                                             |
| --------------- | -------- | ----------------------------------------------------------------------- |
| Analytics       | GET/POST | `/workspaces/<slug>/analytics/`                                         |
| Cycle analytics | GET      | `/workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/analytics/` |

---

## 3. Frontend MobX Stores (State Layer)

**File:** `apps/web/core/store/root.store.ts`

| Store                                  | Key capabilities                                                         |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `issue` (`IssueRootStore`)             | fetchIssues, createIssue, updateIssue, deleteIssue per project/view      |
| `cycle` (`CycleStore`)                 | fetchCycles, createCycle, updateCycle, deleteCycle, addIssueToCycle      |
| `module` (`ModulesStore`)              | fetchModules, createModule, updateModule, deleteModule, addIssueToModule |
| `state` (`StateStore`)                 | fetchStates, createState, updateState, deleteState                       |
| `label` (`LabelStore`)                 | fetchLabels, createLabel, updateLabel, deleteLabel                       |
| `projectRoot` (`ProjectRootStore`)     | fetchProjects, createProject                                             |
| `workspaceRoot` (`WorkspaceRootStore`) | workspace info                                                           |
| `projectInbox` (`ProjectInboxStore`)   | intake/inbox issues                                                      |
| `projectPages` (`ProjectPageStore`)    | page management                                                          |

---

## 4. Authentication & Permissions

**Auth class:** `BaseSessionAuthentication` (`apps/api/plane/authentication/session.py`)

- Extends DRF `SessionAuthentication`, CSRF enforcement disabled for REST APIs.

**Permission levels:**

- `IsAuthenticated` — all views require this minimum
- `ProjectEntityPermission` — project member (any role) for reads; ADMIN/MEMBER for writes
- `ProjectMemberPermission` — workspace ADMIN/MEMBER for creates
- `ProjectAdminPermission` — project ADMIN only
- `allow_permission([ROLE.ADMIN, ROLE.MEMBER])` decorator on individual view methods

**Anonymous users:** No access to any API. All views return `403` for unauthenticated requests.

---

## 5. Configuration System

**File:** `apps/api/plane/license/utils/instance_value.py`

- Reads from `InstanceConfiguration` model (admin-set) or environment variables
- LLM keys stored as: `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`
- Encrypted values supported via `decrypt_data`
- Currently **global/instance-level only** — no per-workspace or per-project LLM config

---

## 6. Database Models Relevant to the Feature

| Model             | Table               | Key Fields                                                               |
| ----------------- | ------------------- | ------------------------------------------------------------------------ |
| `Issue`           | `issues`            | name, priority, state, assignees, labels, description_json, parent, type |
| `Cycle`           | `cycles`            | name, start_date, end_date, owned_by                                     |
| `Module`          | `modules`           | name, status, lead, members, start_date, target_date                     |
| `State`           | `states`            | name, group (backlog/unstarted/started/completed/cancelled)              |
| `Label`           | `labels`            | name, color                                                              |
| `Project`         | `projects`          | name, identifier, workspace                                              |
| `Workspace`       | `workspaces`        | name, slug, owner                                                        |
| `IssueComment`    | `issue_comments`    | text, actor                                                              |
| `IssueRelation`   | `issue_relations`   | relation_type, issue, related_issue                                      |
| `ProjectMember`   | `project_members`   | member, role, is_active                                                  |
| `WorkspaceMember` | `workspace_members` | member, role, is_active                                                  |
| `Profile`         | `profiles`          | user, language, theme, onboarding                                        |

---

## 7. Gaps / Not Yet Present

| Feature                                                    | Status     |
| ---------------------------------------------------------- | ---------- |
| Per-workspace / per-project LLM configuration (UI + model) | ❌ Missing |
| Chat session / conversation history persistence            | ❌ Missing |
| Tool call / tool result persistence                        | ❌ Missing |
| Token usage tracking per message                           | ❌ Missing |
| Agentic loop (multi-step LLM ↔ tools)                      | ❌ Missing |
| Streaming LLM responses                                    | ❌ Missing |
| Floating action button UI                                  | ❌ Missing |
| Chat window UI component                                   | ❌ Missing |
| Model selector UI component                                | ❌ Missing |
| Agent tools module (Python functions over Plane ORM)       | ❌ Missing |
| Reasoning level / max-steps config                         | ❌ Missing |
