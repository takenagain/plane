# Time Tracking (Worklog) — Task Breakdown

> **Feature:** Time Tracking / Worklogs for Plane Community Edition
> **Status:** Draft
> **Last Updated:** 2025-02-18
> **Related:** [requirements.md](./requirements.md) · [design.md](./design.md) · [ARCHITECTURE.md](../../../ARCHITECTURE.md) · [ACTIVATION.md](../../../ACTIVATION.md)

---

## Table of Contents

- [Overview](#overview)
- [Phase 0: Foundation Setup](#phase-0-foundation-setup)
- [Phase 1: Backend — Data Model & API](#phase-1-backend--data-model--api)
- [Phase 2: Frontend — Types, Service & Store](#phase-2-frontend--types-service--store)
- [Phase 3: Frontend — Components](#phase-3-frontend--components)
- [Phase 4: Activity Feed Integration](#phase-4-activity-feed-integration)
- [Phase 5: Testing](#phase-5-testing)
- [Phase 6: Polish & Documentation](#phase-6-polish--documentation)
- [Dependency Graph](#dependency-graph)
- [Effort Summary](#effort-summary)
- [Risk Register](#risk-register)

---

## Overview

Total estimated effort: **6–8 days** (one developer, working sequentially).

| Phase | Description | Estimate | Dependencies |
|-------|-------------|----------|--------------|
| 0 | Foundation Setup | 0.5 day | None |
| 1 | Backend — Data Model & API | 2 days | Phase 0 |
| 2 | Frontend — Types, Service & Store | 1 day | Phase 1 (API contract) |
| 3 | Frontend — Components | 1.5–2 days | Phase 2 |
| 4 | Activity Feed Integration | 1 day | Phase 1 + Phase 3 |
| 5 | Testing | 1–1.5 days | Phase 1–4 |
| 6 | Polish & Documentation | 0.5 day | Phase 5 |

Phases 1 and 2 can partially overlap (frontend types and service can be written against the API contract before the backend is fully tested). Phase 3 depends on Phase 2 being complete.

---

## Phase 0: Foundation Setup

### Task 0.1: Create the `extended/` directory

**Description:** Copy the entire `apps/web/ce/` directory to `apps/web/extended/`. This creates a 1:1 mirror of all CE stubs as our starting point.

**Files:**
- Source: `apps/web/ce/` (all ~118 files)
- Destination: `apps/web/extended/` (new directory)

**Steps:**
1. `cp -r apps/web/ce/ apps/web/extended/`
2. Verify the directory structure matches exactly.
3. Do NOT modify any files yet — this is a clean copy.

**Estimate:** 15 minutes
**Dependencies:** None
**Acceptance:** `diff -r apps/web/ce/ apps/web/extended/` shows no differences.

---

### Task 0.2: Update `tsconfig.json` path alias

**Description:** Change the `@/plane-web/*` alias from `./ce/*` to `./extended/*`.

**Files:**
- `apps/web/tsconfig.json` — modify `paths["@/plane-web/*"]`

**Change:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/plane-web/*": ["./extended/*"],
      "@/*": ["./core/*"]
    }
  }
}
```

**Estimate:** 5 minutes
**Dependencies:** Task 0.1
**Acceptance:** App builds successfully with `pnpm build` (or `pnpm turbo run build --filter=@plane/web`).

---

### Task 0.3: Verify build and runtime

**Description:** Ensure the app builds and runs identically to stock CE after the alias switch.

**Steps:**
1. Run `pnpm check:types` — no new errors.
2. Run `pnpm check:lint` — no new warnings.
3. Run `pnpm dev` — web app loads on port 3000, all existing functionality works.
4. Navigate to an issue detail page — verify worklog stubs still render empty (expected).

**Estimate:** 15 minutes
**Dependencies:** Task 0.2
**Acceptance:** All checks pass, app runs, zero regressions.

---

### Task 0.4: Update `vite.config.ts` if needed

**Description:** Check if Vite's resolve configuration needs updating for the new `extended/` path. In most cases, Vite inherits from `tsconfig.json` paths, but some setups need explicit `resolve.alias` entries.

**Files:**
- `apps/web/vite.config.ts` — inspect and update if necessary

**Estimate:** 10 minutes
**Dependencies:** Task 0.2
**Acceptance:** `pnpm dev` and `pnpm build` both succeed without path resolution errors.

---

## Phase 1: Backend — Data Model & API

### Task 1.1: Create the Worklog model

**Description:** Add the `Worklog` Django model inheriting from `ProjectBaseModel`.

**Files:**
- `apps/api/plane/db/models/worklog.py` — **new file**
- `apps/api/plane/db/models/__init__.py` — add `Worklog` import/export

**Model fields:**
| Field | Type | Constraints |
|-------|------|-------------|
| `issue` | `ForeignKey(Issue)` | `on_delete=CASCADE`, `related_name="issue_worklogs"` |
| `actor` | `ForeignKey(User)` | `on_delete=SET_NULL`, `null=True`, `related_name="worklogs"` |
| `description` | `TextField` | `blank=True`, `default=""` |
| `duration` | `PositiveIntegerField` | `MinValueValidator(1)`, `MaxValueValidator(99999)` |
| `logged_at` | `DateField` | Required |

**Meta:**
- `db_table = "worklogs"`
- `ordering = ("-logged_at", "-created_at")`
- Composite index on `(issue, -logged_at)`

**Estimate:** 30 minutes
**Dependencies:** None (can start alongside Phase 0)
**Acceptance:** Model class imports cleanly, no Python syntax errors.

---

### Task 1.2: Generate and review migration

**Description:** Auto-generate the Django migration for the new Worklog model.

**Steps:**
1. `cd apps/api && python manage.py makemigrations db --name worklog`
2. Review the generated migration file for correctness.
3. `python manage.py migrate` — apply the migration locally.
4. Verify the `worklogs` table exists in PostgreSQL with correct columns and indexes.

**Files:**
- `apps/api/plane/db/migrations/XXXX_worklog.py` — auto-generated

**Estimate:** 15 minutes
**Dependencies:** Task 1.1
**Acceptance:** Migration applies without errors; `\d worklogs` in psql shows expected schema.

---

### Task 1.3: Create the Worklog serializer

**Description:** Add DRF serializers for the Worklog model.

**Files:**
- `apps/api/plane/app/serializers/worklog.py` — **new file**
- `apps/api/plane/app/serializers/__init__.py` — add imports

**Serializers:**
1. `WorklogSerializer` — full CRUD serializer with:
   - Read-only: `id`, `issue`, `actor`, `project`, `workspace`, `created_at`, `updated_at`, `created_by`
   - Writable: `description`, `duration`, `logged_at`
   - Custom validators: `validate_logged_at` (not future), `validate_duration` (1–99999), `validate_description` (max 10,000 chars)
2. `WorklogTotalSerializer` — read-only serializer for `{ total_duration: int }`

**Estimate:** 30 minutes
**Dependencies:** Task 1.1
**Acceptance:** Serializer validates correctly for valid/invalid inputs (can verify with Django shell).

---

### Task 1.4: Create the Worklog ViewSet

**Description:** Add the DRF ViewSet with CRUD endpoints and total aggregation.

**Files:**
- `apps/api/plane/app/views/issue/worklog.py` — **new file**
- `apps/api/plane/app/views/__init__.py` — add `WorklogViewSet` import

**Methods:**
| Method | HTTP | URL suffix | Permission |
|--------|------|------------|------------|
| `create` | POST | `/worklogs/` | Admin, Member |
| `list` | GET | `/worklogs/` | Admin, Member, Guest |
| `total` | GET | `/worklogs/total/` | Admin, Member, Guest |
| `partial_update` | PATCH | `/worklogs/{pk}/` | Admin or creator |
| `destroy` | DELETE | `/worklogs/{pk}/` | Admin or creator |

**Key implementation details:**
- `get_queryset()` filters by workspace slug, project_id, issue_id, and active project membership.
- Each write method dispatches `issue_activity.delay(...)` with appropriate type string.
- Follows the exact same patterns as `IssueCommentViewSet`.

**Estimate:** 1.5 hours
**Dependencies:** Task 1.3
**Acceptance:** All endpoints return correct status codes when tested with `curl` or Django test client.

---

### Task 1.5: Add URL routing

**Description:** Wire up the WorklogViewSet to URL patterns.

**Files:**
- `apps/api/plane/app/urls/worklog.py` — **new file**
- `apps/api/plane/app/urls/__init__.py` — include worklog_urls

**URL patterns:**
```
workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/
    → GET (list), POST (create)

workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/total/
    → GET (total)

workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/
    → PATCH (partial_update), DELETE (destroy)
```

**Estimate:** 20 minutes
**Dependencies:** Task 1.4
**Acceptance:** `python manage.py show_urls | grep worklog` shows all expected routes.

---

### Task 1.6: Manual API smoke test

**Description:** Verify the full API works end-to-end against a running development instance.

**Steps:**
1. Start the Django dev server.
2. Create a worklog via POST (using session auth or test user token).
3. List worklogs via GET — verify the created worklog appears.
4. Get total via GET — verify correct sum.
5. Update the worklog via PATCH — verify changed fields.
6. Delete the worklog via DELETE — verify 204 and worklog gone from list.
7. Test permission enforcement: guest cannot create (403), member cannot update another's (403).

**Estimate:** 30 minutes
**Dependencies:** Task 1.5
**Acceptance:** All CRUD operations work, permissions enforced, correct status codes.

---

## Phase 2: Frontend — Types, Service & Store

### Task 2.1: Add worklog type definitions

**Description:** Create TypeScript interfaces for the worklog data model.

**Files:**
- `packages/types/src/worklog.ts` — **new file**
- `packages/types/src/index.ts` — add `export * from "./worklog"`

**Types:**
- `IWorklog` — full worklog object matching serializer output
- `IWorklogCreatePayload` — `{ description?: string, duration: number, logged_at?: string }`
- `IWorklogUpdatePayload` — `{ description?: string, duration?: number, logged_at?: string }`
- `IWorklogTotalResponse` — `{ total_duration: number }`

**Estimate:** 20 minutes
**Dependencies:** Task 1.3 (API contract finalized)
**Acceptance:** Types compile cleanly, `pnpm check:types` passes.

---

### Task 2.2: Create the WorklogService

**Description:** HTTP client service for worklog API endpoints, extending `APIService`.

**Files:**
- `packages/services/src/worklog/worklog.service.ts` — **new file**
- `packages/services/src/worklog/index.ts` — **new file** (re-export)
- `packages/services/src/index.ts` — add `export * from "./worklog"`

**Methods:**
| Method | HTTP | Returns |
|--------|------|---------|
| `create(slug, projId, issueId, data)` | POST | `Promise<IWorklog>` |
| `list(slug, projId, issueId)` | GET | `Promise<IWorklog[]>` |
| `getTotal(slug, projId, issueId)` | GET | `Promise<IWorklogTotalResponse>` |
| `update(slug, projId, issueId, worklogId, data)` | PATCH | `Promise<IWorklog>` |
| `remove(slug, projId, issueId, worklogId)` | DELETE | `Promise<void>` |

**Estimate:** 30 minutes
**Dependencies:** Task 2.1
**Acceptance:** Service compiles, methods match API contract, `pnpm check:types` passes.

---

### Task 2.3: Create the WorklogStore (MobX)

**Description:** Observable MobX store for managing worklog state on the frontend.

**Files:**
- `apps/web/extended/store/worklog.store.ts` — **new file**

**Observables:**
- `worklogsByIssue: Record<string, IWorklog[]>` — per-issue worklog cache
- `totalByIssue: Record<string, number>` — per-issue total duration cache
- `isLoading: boolean` — loading state flag

**Actions:**
- `fetchWorklogs(slug, projId, issueId)` — fetches and caches worklogs
- `fetchTotal(slug, projId, issueId)` — fetches and caches total
- `createWorklog(slug, projId, issueId, data)` — creates and optimistically updates cache
- `updateWorklog(slug, projId, issueId, worklogId, data)` — updates and adjusts cache
- `deleteWorklog(slug, projId, issueId, worklogId)` — deletes and adjusts cache

**Estimate:** 1 hour
**Dependencies:** Task 2.2
**Acceptance:** Store compiles, all actions are MobX-observable, optimistic updates work correctly.

---

### Task 2.4: Wire WorklogStore into RootStore

**Description:** Extend the CE `RootStore` (in `extended/`) to include the `WorklogStore`.

**Files:**
- `apps/web/extended/store/root.store.ts` — **modify** (add WorklogStore import and instantiation)

**Changes:**
1. Import `IWorklogStore` and `WorklogStore` from `./worklog.store`.
2. Add `worklogStore: IWorklogStore` property.
3. Instantiate in constructor: `this.worklogStore = new WorklogStore()`.

**Estimate:** 10 minutes
**Dependencies:** Task 2.3
**Acceptance:** `pnpm check:types` passes, RootStore includes worklogStore.

---

### Task 2.5: Add duration formatting utility

**Description:** Create a shared helper function for formatting minutes into a human-readable string.

**Files:**
- `apps/web/extended/helpers/worklog.helpers.ts` — **new file**

**Functions:**
```typescript
/**
 * Format a duration in minutes to "Xh Ym" display string.
 * Examples: 150 → "2h 30m", 45 → "0h 45m", 0 → "0h 0m"
 */
export function formatDuration(totalMinutes: number): string;

/**
 * Parse hours and minutes inputs into total minutes.
 * Returns NaN if inputs are invalid.
 */
export function parseDuration(hours: number, minutes: number): number;
```

**Estimate:** 15 minutes
**Dependencies:** None
**Acceptance:** Unit-testable pure functions, no side effects.

---

## Phase 3: Frontend — Components

### Task 3.1: Implement `IssueWorklogProperty`

**Description:** Replace the CE stub with a real component that displays total logged time in the issue detail sidebar.

**Files:**
- `apps/web/extended/components/issues/worklog/property/root.tsx` — **overwrite** CE stub

**Behavior:**
1. Uses MobX `observer()` wrapper.
2. On mount, calls `worklogStore.fetchTotal(workspaceSlug, projectId, issueId)`.
3. Reads `worklogStore.totalByIssue[issueId]` reactively.
4. Renders a property row with clock icon, "Time Logged" label, and formatted duration.
5. If `disabled === false`, clicking opens/scrolls to the worklog create form.
6. Shows a loading skeleton while `isLoading` is true.

**Props (unchanged from CE stub):**
```typescript
{
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
}
```

**UI layout:**
```
┌──────────────────────────────────┐
│ ⏱ Time Logged         8h 30m    │
└──────────────────────────────────┘
```

**Estimate:** 1 hour
**Dependencies:** Task 2.4, Task 2.5
**Acceptance:** Component renders total time, updates reactively when worklogs change, respects `disabled` prop.

---

### Task 3.2: Implement `WorklogForm`

**Description:** Create a new form component for creating and editing worklog entries.

**Files:**
- `apps/web/extended/components/issues/worklog/activity/worklog-form.tsx` — **new file**

**Props:**
```typescript
{
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  onClose: () => void;
  existingWorklog?: IWorklog; // if provided, form is in edit mode
}
```

**UI layout:**
```
┌─────────────────────────────────────────────────┐
│  Log Time                                        │
│                                                  │
│  Duration:  [  2 ] h  [ 30 ] m                  │
│  Date:      [ 2025-02-18      ] 📅              │
│  Notes:     [ Fixed auth bug...            ]     │
│                                                  │
│              [ Cancel ]  [ Log time ✓ ]          │
└─────────────────────────────────────────────────┘
```

**Behavior:**
1. Hours input (0–1666) and minutes input (0–59) for duration.
2. Date picker defaults to today; rejects future dates.
3. Optional textarea for description (max 10,000 chars).
4. On submit: converts hours/minutes to total duration, calls `worklogStore.createWorklog(...)` or `worklogStore.updateWorklog(...)`.
5. Shows inline validation errors (duration required, date not future).
6. Shows loading spinner on submit button during API call.
7. Calls `onClose()` on successful submit or cancel.
8. In edit mode, pre-populates fields from `existingWorklog`.

**Estimate:** 1.5 hours
**Dependencies:** Task 2.4, Task 2.5
**Acceptance:** Form creates worklogs, validates inputs, shows errors, edit mode works.

---

### Task 3.3: Implement `IssueActivityWorklogCreateButton`

**Description:** Replace the CE stub with a real button that toggles the `WorklogForm`.

**Files:**
- `apps/web/extended/components/issues/worklog/activity/worklog-create-button.tsx` — **overwrite** CE stub

**Behavior:**
1. Renders a "Log time" button with a clock icon.
2. Maintains local `isFormOpen` state.
3. On click, renders `<WorklogForm>` below the button.
4. When `disabled === true`, renders nothing (or a visually disabled button).
5. Uses `@plane/ui` `Button` component for consistency.

**Props (unchanged from CE stub):**
```typescript
{
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
}
```

**Estimate:** 30 minutes
**Dependencies:** Task 3.2
**Acceptance:** Button toggles form, disabled state works, form creation triggers store update.

---

### Task 3.4: Implement `IssueActivityWorklog`

**Description:** Replace the CE stub with a real component that renders a worklog activity entry in the issue activity feed.

**Files:**
- `apps/web/extended/components/issues/worklog/activity/root.tsx` — **overwrite** CE stub

**Behavior:**
1. Receives an `activityComment: TIssueActivityComment` containing `IssueActivity` data.
2. Checks if `activity.field === "worklog"`.
3. Renders actor avatar, actor display name, action text based on `verb`:
   - `"created"`: "logged {new_value}" (e.g., "logged 2h 30m")
   - `"updated"`: "updated worklog from {old_value} to {new_value}"
   - `"deleted"`: "removed worklog of {old_value}"
4. Shows relative timestamp (e.g., "2 hours ago").
5. If description is available (stored in `old_value` for create), shows it below the action text.
6. If the current user is the actor or an admin, shows Edit and Delete action buttons.
7. Edit opens the `WorklogForm` in edit mode (needs to fetch the worklog data or use activity data).
8. Delete calls `worklogStore.deleteWorklog(...)` with confirmation.
9. Uses the `ends` prop to render timeline connector lines (top/bottom), matching the existing activity feed UI pattern.

**Props (unchanged from CE stub):**
```typescript
{
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  activityComment: TIssueActivityComment;
  ends?: "top" | "bottom";
}
```

**Estimate:** 1.5 hours
**Dependencies:** Task 2.4, Task 3.2
**Acceptance:** Activity entry renders correctly for create/update/delete verbs, edit/delete actions work, timeline lines render.

---

### Task 3.5: Update `ActivityFilterRoot`

**Description:** Extend the activity filter to include a "Worklogs" filter option.

**Files:**
- `apps/web/extended/components/issues/worklog/activity/filter-root.tsx` — **modify** (copy already has CE implementation)

**Changes:**
1. Add a `WORKLOG` key to the filter options list.
2. The filter should toggle visibility of `field === "worklog"` activities.
3. Keep all existing filter behavior intact.
4. If `ACTIVITY_FILTER_TYPE_OPTIONS` in `@plane/constants` doesn't include `WORKLOG`, add it locally or extend the options inline.

**Estimate:** 30 minutes
**Dependencies:** Task 3.4
**Acceptance:** Worklog filter appears in dropdown, toggling it shows/hides worklog activity entries.

---

### Task 3.6: Update `extended/components/issues/worklog/activity/index.ts`

**Description:** Ensure the barrel export file exports all necessary components including the new `WorklogForm`.

**Files:**
- `apps/web/extended/components/issues/worklog/activity/index.ts` — **modify**

**Changes:**
```typescript
export * from "./root";
export * from "./worklog-create-button";
export * from "./worklog-form";
export * from "./filter-root";
```

**Estimate:** 5 minutes
**Dependencies:** Task 3.2, Task 3.3, Task 3.4, Task 3.5
**Acceptance:** All components importable from the barrel export.

---

## Phase 4: Activity Feed Integration

### Task 4.1: Add worklog activity handler functions

**Description:** Add Celery background task handler functions for worklog CRUD events.

**Files:**
- `apps/api/plane/bgtasks/issue_activities_task.py` — **modify** (add three functions + register in mapper)

**Functions to add:**
1. `create_worklog_activity(...)` — creates `IssueActivity` with `field="worklog"`, `verb="created"`, `new_value="Xh Ym"`
2. `update_worklog_activity(...)` — creates `IssueActivity` with `verb="updated"`, old/new duration values
3. `delete_worklog_activity(...)` — creates `IssueActivity` with `verb="deleted"`, `old_value="Xh Ym"`

**Register in `ACTIVITY_MAPPER`:**
```python
"worklog.activity.created": create_worklog_activity,
"worklog.activity.updated": update_worklog_activity,
"worklog.activity.deleted": delete_worklog_activity,
```

**Estimate:** 1 hour
**Dependencies:** Task 1.4 (ViewSet dispatches these event types)
**Acceptance:** Creating/updating/deleting worklogs generates IssueActivity records visible in the activity feed.

---

### Task 4.2: Verify activity feed renders worklog entries

**Description:** End-to-end verification that worklog activities appear in the issue activity feed.

**Steps:**
1. Create a worklog via the UI.
2. Refresh the issue detail page.
3. Verify the activity feed shows "logged Xh Ym" entry with correct actor and timestamp.
4. Update the worklog — verify "updated worklog" entry appears.
5. Delete the worklog — verify "removed worklog" entry appears.
6. Test the activity filter — toggle "Worklogs" filter on/off.

**Estimate:** 30 minutes
**Dependencies:** Task 4.1, Task 3.4, Task 3.5
**Acceptance:** All worklog activities render correctly in the feed with proper formatting and filtering.

---

## Phase 5: Testing

### Task 5.1: Backend unit tests — Model & Serializer

**Description:** Write Django tests for the Worklog model and serializer validation.

**Files:**
- `apps/api/plane/tests/test_worklog_model.py` — **new file**

**Test cases:**
| Test | Description |
|------|-------------|
| `test_create_worklog` | Valid worklog creation succeeds |
| `test_duration_min_validation` | Duration < 1 raises validation error |
| `test_duration_max_validation` | Duration > 99999 raises validation error |
| `test_logged_at_future_validation` | Future date raises validation error |
| `test_description_max_length` | Description > 10,000 chars raises validation error |
| `test_cascade_delete_issue` | Deleting issue deletes associated worklogs |
| `test_set_null_actor` | Deleting user sets worklog actor to null |
| `test_ordering` | Worklogs ordered by `-logged_at, -created_at` |
| `test_auto_workspace_from_project` | Workspace is auto-set from project |

**Estimate:** 1 hour
**Dependencies:** Task 1.3
**Acceptance:** All tests pass with `python manage.py test plane.tests.test_worklog_model`.

---

### Task 5.2: Backend unit tests — ViewSet & Permissions

**Description:** Write Django tests for the WorklogViewSet endpoints and permission checks.

**Files:**
- `apps/api/plane/tests/test_worklog_api.py` — **new file**

**Test cases:**
| Test | Description |
|------|-------------|
| `test_create_worklog_as_member` | Member can create (201) |
| `test_create_worklog_as_guest_forbidden` | Guest cannot create (403) |
| `test_create_worklog_missing_duration` | Missing duration returns 400 |
| `test_create_worklog_future_date` | Future logged_at returns 400 |
| `test_list_worklogs` | Returns all worklogs for issue (200) |
| `test_list_worklogs_empty` | Returns empty array when no worklogs (200) |
| `test_total_worklogs` | Returns correct sum (200) |
| `test_total_worklogs_zero` | Returns 0 when no worklogs (200) |
| `test_update_own_worklog` | Creator can update (200) |
| `test_update_other_worklog_forbidden` | Non-creator member cannot update (403) |
| `test_update_worklog_as_admin` | Admin can update any (200) |
| `test_delete_own_worklog` | Creator can delete (204) |
| `test_delete_other_worklog_forbidden` | Non-creator member cannot delete (403) |
| `test_delete_worklog_as_admin` | Admin can delete any (204) |
| `test_non_member_forbidden` | Non-project-member gets 403 on all endpoints |

**Estimate:** 1.5 hours
**Dependencies:** Task 1.5
**Acceptance:** All tests pass with `python manage.py test plane.tests.test_worklog_api`.

---

### Task 5.3: Backend unit tests — Activity integration

**Description:** Test that worklog CRUD operations generate correct IssueActivity records.

**Files:**
- `apps/api/plane/tests/test_worklog_activity.py` — **new file**

**Test cases:**
| Test | Description |
|------|-------------|
| `test_create_generates_activity` | Creating a worklog creates an IssueActivity with field="worklog", verb="created" |
| `test_update_generates_activity` | Updating a worklog creates an IssueActivity with verb="updated" |
| `test_delete_generates_activity` | Deleting a worklog creates an IssueActivity with verb="deleted" |
| `test_activity_duration_format` | Activity new_value/old_value contain correctly formatted duration |

**Estimate:** 45 minutes
**Dependencies:** Task 4.1
**Acceptance:** All tests pass.

---

### Task 5.4: Frontend component tests

**Description:** Write unit tests for the new frontend components.

**Files:**
- `apps/web/extended/components/issues/worklog/__tests__/worklog-property.test.tsx` — **new file**
- `apps/web/extended/components/issues/worklog/__tests__/worklog-form.test.tsx` — **new file**
- `apps/web/extended/components/issues/worklog/__tests__/worklog-create-button.test.tsx` — **new file**

**Test cases (property):**
| Test | Description |
|------|-------------|
| `renders total time` | Displays formatted duration from store |
| `renders zero state` | Shows "0h 0m" when no worklogs |
| `loading state` | Shows skeleton during fetch |

**Test cases (form):**
| Test | Description |
|------|-------------|
| `validates duration required` | Shows error when submitting without duration |
| `validates future date` | Shows error when selecting future date |
| `calls store on submit` | Calls `worklogStore.createWorklog` with correct data |
| `pre-populates in edit mode` | Fills fields from existing worklog |
| `calls onClose on cancel` | Cancel button triggers onClose callback |

**Test cases (create button):**
| Test | Description |
|------|-------------|
| `renders when not disabled` | Button visible with "Log time" text |
| `hidden when disabled` | Nothing rendered when disabled=true |
| `toggles form` | Click opens form, second click closes |

**Estimate:** 1.5 hours
**Dependencies:** Task 3.1, Task 3.2, Task 3.3
**Acceptance:** All tests pass with existing test runner.

---

### Task 5.5: Frontend store tests

**Description:** Write unit tests for the WorklogStore MobX actions.

**Files:**
- `apps/web/extended/store/__tests__/worklog.store.test.ts` — **new file**

**Test cases:**
| Test | Description |
|------|-------------|
| `fetchWorklogs populates map` | After fetch, `worklogsByIssue[issueId]` contains returned data |
| `fetchTotal populates total` | After fetch, `totalByIssue[issueId]` contains correct value |
| `createWorklog optimistic update` | New worklog prepended to list, total incremented |
| `updateWorklog adjusts total` | Total adjusted by difference in old/new duration |
| `deleteWorklog removes from list` | Worklog removed from list, total decremented |
| `isLoading during fetch` | `isLoading` is true during fetch, false after |

**Estimate:** 45 minutes
**Dependencies:** Task 2.3
**Acceptance:** All tests pass.

---

### Task 5.6: Formatting utility tests

**Description:** Write unit tests for the duration formatting helpers.

**Files:**
- `apps/web/extended/helpers/__tests__/worklog.helpers.test.ts` — **new file**

**Test cases:**
| Test | Description |
|------|-------------|
| `formatDuration(150)` | Returns "2h 30m" |
| `formatDuration(45)` | Returns "0h 45m" |
| `formatDuration(0)` | Returns "0h 0m" |
| `formatDuration(60)` | Returns "1h 0m" |
| `formatDuration(1)` | Returns "0h 1m" |
| `parseDuration(2, 30)` | Returns 150 |
| `parseDuration(0, 0)` | Returns 0 |
| `parseDuration(-1, 30)` | Returns NaN |

**Estimate:** 20 minutes
**Dependencies:** Task 2.5
**Acceptance:** All tests pass.

---

## Phase 6: Polish & Documentation

### Task 6.1: Add license headers to all new files

**Description:** Ensure all new files have the AGPL-3.0 license header.

**Header (Python):**
```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
```

**Header (TypeScript):**
```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
```

**Files:** All new files from Phases 1–5.
**Estimate:** 15 minutes
**Dependencies:** All previous phases
**Acceptance:** `grep` confirms all new `.py`, `.ts`, `.tsx` files have the header.

---

### Task 6.2: Run full check suite

**Description:** Run all linting, formatting, and type checks across the monorepo.

**Steps:**
1. `pnpm check` — runs format, lint, and type checks.
2. `pnpm fix` — auto-fix any formatting issues.
3. Address any remaining lint warnings (aim for zero new warnings).
4. Backend: `cd apps/api && python -m flake8 plane/db/models/worklog.py plane/app/serializers/worklog.py plane/app/views/issue/worklog.py` (if flake8 is configured).

**Estimate:** 30 minutes
**Dependencies:** All previous phases
**Acceptance:** `pnpm check` exits with zero errors/warnings. Backend linting passes.

---

### Task 6.3: Update design docs with final file paths

**Description:** Review and update the design documents (requirements.md, design.md, tasks.md) with any deviations discovered during implementation.

**Files:**
- `docs/design/time-tracking/requirements.md`
- `docs/design/time-tracking/design.md`
- `docs/design/time-tracking/tasks.md`

**Estimate:** 15 minutes
**Dependencies:** All previous phases
**Acceptance:** Docs accurately reflect the implemented solution.

---

### Task 6.4: Create pull request

**Description:** Push all changes to the `feature/time-tracking` branch on the fork and create a PR.

**Steps:**
1. Commit all changes with a clear commit message structure:
   - `feat(backend): add Worklog model, serializer, viewset, and migrations`
   - `feat(frontend): add worklog types, service, and MobX store`
   - `feat(frontend): implement worklog UI components in extended/`
   - `feat(backend): add worklog activity tracking integration`
   - `test: add worklog backend and frontend tests`
   - `docs: add time-tracking design specification`
2. Push to `takenagain/plane` on `feature/time-tracking` branch.
3. Create PR targeting `preview` branch.
4. Fill in PR description with summary, screenshots, and test results.

**Estimate:** 20 minutes
**Dependencies:** All previous phases
**Acceptance:** PR created with clean diff, CI passes.

---

## Dependency Graph

```
Phase 0: Foundation
  0.1 Create extended/
    └── 0.2 Update tsconfig.json
         ├── 0.3 Verify build
         └── 0.4 Update vite.config.ts (if needed)

Phase 1: Backend (can start alongside Phase 0)
  1.1 Worklog model
    ├── 1.2 Migration
    └── 1.3 Serializer
         └── 1.4 ViewSet
              └── 1.5 URL routing
                   └── 1.6 Smoke test

Phase 2: Frontend Types/Service/Store (needs Phase 1.3 for API contract)
  2.1 Type definitions
    └── 2.2 WorklogService
         └── 2.3 WorklogStore
              └── 2.4 Wire into RootStore
  2.5 Duration helpers (independent)

Phase 3: Frontend Components (needs Phase 2)
  3.2 WorklogForm (needs 2.4, 2.5)
    ├── 3.1 IssueWorklogProperty (needs 2.4, 2.5)
    ├── 3.3 WorklogCreateButton (needs 3.2)
    └── 3.4 IssueActivityWorklog (needs 2.4, 3.2)
         └── 3.5 ActivityFilterRoot (needs 3.4)
              └── 3.6 Update barrel exports

Phase 4: Activity Integration (needs Phase 1.4 + Phase 3)
  4.1 Activity handler functions
    └── 4.2 Verify activity feed

Phase 5: Testing (needs Phases 1-4)
  5.1 Model/Serializer tests (needs 1.3)
  5.2 ViewSet/Permission tests (needs 1.5)
  5.3 Activity tests (needs 4.1)
  5.4 Component tests (needs 3.1-3.3)
  5.5 Store tests (needs 2.3)
  5.6 Helper tests (needs 2.5)

Phase 6: Polish (needs Phase 5)
  6.1 License headers
  6.2 Full check suite
  6.3 Update docs
  6.4 Create PR
```

---

## Effort Summary

| Phase | Tasks | Estimate | Cumulative |
|-------|-------|----------|------------|
| **Phase 0** | 0.1 – 0.4 | 0.75 hours | 0.75 hours |
| **Phase 1** | 1.1 – 1.6 | 4.25 hours | 5.0 hours |
| **Phase 2** | 2.1 – 2.5 | 2.25 hours | 7.25 hours |
| **Phase 3** | 3.1 – 3.6 | 4.1 hours | 11.35 hours |
| **Phase 4** | 4.1 – 4.2 | 1.5 hours | 12.85 hours |
| **Phase 5** | 5.1 – 5.6 | 5.75 hours | 18.6 hours |
| **Phase 6** | 6.1 – 6.4 | 1.3 hours | 19.9 hours |
| | | **Total** | **~20 hours (3–4 working days)** |

**Notes:**
- Estimates assume familiarity with the Plane codebase. Add 30–50% buffer for first-time contributors.
- Testing phase (5) can be partially parallelized with implementation phases if TDD approach is used.
- Phase 4 (activity integration) can be done in parallel with Phase 3 (components).

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner Task |
|---|------|-----------|--------|------------|------------|
| R1 | `extended/` copy gets out of sync with upstream `ce/` on merge | Medium | Medium | Only modify worklog-related files; keep everything else as exact copy; document which files differ | 0.1 |
| R2 | `@allow_permission(creator=True, model=Worklog)` pattern doesn't work as expected | Low | High | Test permission enforcement thoroughly in Task 5.2; fall back to manual `created_by` check in ViewSet | 1.4 |
| R3 | `issue_activity.delay` does not recognize new `worklog.activity.*` types | Medium | Medium | The `ACTIVITY_MAPPER` dict lookup returns `None` for unknown types and silently skips; ensure registration is correct | 4.1 |
| R4 | MobX store not accessible from `extended/` components due to context/provider setup | Low | High | Verify store provider pattern by checking how existing `ce/store/root.store.ts` components access the store | 2.4 |
| R5 | Vite path resolution differs from TypeScript path resolution | Low | Medium | Test early in Task 0.3/0.4; Vite may need explicit `resolve.alias` in config | 0.4 |
| R6 | Duration validation edge cases (0 minutes with hours, negative values) | Low | Low | Add comprehensive validation tests; handle edge cases in both backend and frontend | 5.1, 5.6 |
| R7 | Large number of worklogs per issue causes slow list/total queries | Low | Medium | Composite index on `(issue, -logged_at)` addresses this; add pagination if needed later | 1.1 |
| R8 | Breaking changes to upstream `TIssueActivityComment` type | Low | Medium | Pin to current type shape; update if upstream changes during development | 3.4 |

---

## File Inventory

### New Files

| File | Phase | Type |
|------|-------|------|
| `apps/web/extended/` (entire directory) | 0.1 | Directory (copy of ce/) |
| `apps/api/plane/db/models/worklog.py` | 1.1 | Python model |
| `apps/api/plane/db/migrations/XXXX_worklog.py` | 1.2 | Python migration |
| `apps/api/plane/app/serializers/worklog.py` | 1.3 | Python serializer |
| `apps/api/plane/app/views/issue/worklog.py` | 1.4 | Python viewset |
| `apps/api/plane/app/urls/worklog.py` | 1.5 | Python URL conf |
| `packages/types/src/worklog.ts` | 2.1 | TypeScript types |
| `packages/services/src/worklog/worklog.service.ts` | 2.2 | TypeScript service |
| `packages/services/src/worklog/index.ts` | 2.2 | TypeScript barrel |
| `apps/web/extended/store/worklog.store.ts` | 2.3 | TypeScript MobX store |
| `apps/web/extended/helpers/worklog.helpers.ts` | 2.5 | TypeScript helpers |
| `apps/web/extended/components/issues/worklog/activity/worklog-form.tsx` | 3.2 | React component |
| `apps/api/plane/tests/test_worklog_model.py` | 5.1 | Python test |
| `apps/api/plane/tests/test_worklog_api.py` | 5.2 | Python test |
| `apps/api/plane/tests/test_worklog_activity.py` | 5.3 | Python test |
| `apps/web/extended/components/issues/worklog/__tests__/worklog-property.test.tsx` | 5.4 | TypeScript test |
| `apps/web/extended/components/issues/worklog/__tests__/worklog-form.test.tsx` | 5.4 | TypeScript test |
| `apps/web/extended/components/issues/worklog/__tests__/worklog-create-button.test.tsx` | 5.4 | TypeScript test |
| `apps/web/extended/store/__tests__/worklog.store.test.ts` | 5.5 | TypeScript test |
| `apps/web/extended/helpers/__tests__/worklog.helpers.test.ts` | 5.6 | TypeScript test |
| `docs/design/time-tracking/requirements.md` | Pre | Markdown |
| `docs/design/time-tracking/design.md` | Pre | Markdown |
| `docs/design/time-tracking/tasks.md` | Pre | Markdown |

### Modified Files

| File | Phase | Change |
|------|-------|--------|
| `apps/web/tsconfig.json` | 0.2 | Change `@/plane-web/*` alias to `./extended/*` |
| `apps/web/vite.config.ts` | 0.4 | Add resolve alias if needed |
| `apps/api/plane/db/models/__init__.py` | 1.1 | Add `Worklog` import |
| `apps/api/plane/app/serializers/__init__.py` | 1.3 | Add serializer imports |
| `apps/api/plane/app/views/__init__.py` | 1.4 | Add `WorklogViewSet` import |
| `apps/api/plane/app/urls/__init__.py` | 1.5 | Include worklog URL patterns |
| `packages/types/src/index.ts` | 2.1 | Add `export * from "./worklog"` |
| `packages/services/src/index.ts` | 2.2 | Add `export * from "./worklog"` |
| `apps/web/extended/store/root.store.ts` | 2.4 | Add WorklogStore to RootStore |
| `apps/web/extended/components/issues/worklog/property/root.tsx` | 3.1 | Replace stub with real component |
| `apps/web/extended/components/issues/worklog/activity/worklog-create-button.tsx` | 3.3 | Replace stub with real component |
| `apps/web/extended/components/issues/worklog/activity/root.tsx` | 3.4 | Replace stub with real component |
| `apps/web/extended/components/issues/worklog/activity/filter-root.tsx` | 3.5 | Add worklog filter option |
| `apps/web/extended/components/issues/worklog/activity/index.ts` | 3.6 | Update barrel exports |
| `apps/api/plane/bgtasks/issue_activities_task.py` | 4.1 | Add worklog activity handlers + mapper entries |