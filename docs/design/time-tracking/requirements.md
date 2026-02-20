# Time Tracking (Worklog) — Requirements Specification

> **Feature:** Time Tracking / Worklogs for Plane Community Edition
> **Status:** Draft
> **Last Updated:** 2025-02-18
> **Related:** [ARCHITECTURE.md](../../../ARCHITECTURE.md) · [ACTIVATION.md](../../../ACTIVATION.md)

---

## Table of Contents

- [1. Background & Motivation](#1-background--motivation)
- [2. Scope](#2-scope)
- [3. Actors & Roles](#3-actors--roles)
- [4. Functional Requirements](#4-functional-requirements)
  - [FR-1: Create Worklog](#fr-1-create-worklog)
  - [FR-2: List Worklogs](#fr-2-list-worklogs)
  - [FR-3: Total Time Aggregation](#fr-3-total-time-aggregation)
  - [FR-4: Update Worklog](#fr-4-update-worklog)
  - [FR-5: Delete Worklog](#fr-5-delete-worklog)
  - [FR-6: Issue Detail — Time Property](#fr-6-issue-detail--time-property)
  - [FR-7: Activity Feed Integration](#fr-7-activity-feed-integration)
  - [FR-8: Activity Filter — Worklog Filter](#fr-8-activity-filter--worklog-filter)
  - [FR-9: Worklog Creation UI](#fr-9-worklog-creation-ui)
- [5. Non-Functional Requirements](#5-non-functional-requirements)
- [6. Out of Scope (v1)](#6-out-of-scope-v1)
- [7. Acceptance Criteria Summary](#7-acceptance-criteria-summary)

---

## 1. Background & Motivation

Plane's Commercial Edition includes a **time tracking (worklog)** feature gated behind the Pro plan ($8/user/month). In the Community Edition (CE), three frontend component stubs exist that render empty fragments:

| CE Stub File | Component | Renders |
|---|---|---|
| `ce/components/issues/worklog/property/root.tsx` | `IssueWorklogProperty` | `<></>` |
| `ce/components/issues/worklog/activity/root.tsx` | `IssueActivityWorklog` | `<></>` |
| `ce/components/issues/worklog/activity/worklog-create-button.tsx` | `IssueActivityWorklogCreateButton` | `<></>` |

The backend has **no worklog model, serializer, view, or URL route** in the CE codebase. The entire feature must be built from scratch — both backend (Django REST Framework) and frontend (React + MobX).

This document specifies requirements for a **Minimum Viable Product (MVP)** that implements time tracking in the CE using the hybrid approach (Approach C from ACTIVATION.md): create an `apps/web/extended/` directory with real implementations, switch the `@/plane-web/*` tsconfig alias, and add backend endpoints in the existing Django app.

---

## 2. Scope

### In Scope

- Worklog CRUD (create, read, update, delete) on any issue
- Per-issue total time aggregation
- Worklog display in issue detail sidebar (property badge)
- Worklog entries in the issue activity feed
- Activity filter for worklog entries
- Worklog creation/edit form UI
- Backend model, migration, serializer, viewset, and URL routing
- Frontend type definitions, API service, MobX store, and components
- Permission enforcement consistent with existing Plane patterns

### Out of Scope (see §6)

- Timers / stopwatch (real-time tracking)
- Project-level or workspace-level time reports / analytics
- CSV/PDF export of time data
- Billing integration
- Time estimates vs. actuals comparison
- Bulk worklog operations
- API v1 (external/public API) endpoints — internal API only for MVP

---

## 3. Actors & Roles

Plane's existing role model applies. Permissions for worklogs follow the same pattern as issue comments:

| Role | Create | Read | Update | Delete |
|------|--------|------|--------|--------|
| **Admin** | ✅ | ✅ | ✅ (any) | ✅ (any) |
| **Member** | ✅ | ✅ | ✅ (own) | ✅ (own) |
| **Guest** | ❌ | ✅ (if `guest_view_all_features` is enabled on the project, otherwise only on issues they created) | ❌ | ❌ |

---

## 4. Functional Requirements

### FR-1: Create Worklog

**Description:** A user with write permissions can log time against an issue.

**Input:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `description` | string | No | Max 10,000 characters. Plain text. |
| `duration` | integer | Yes | Positive integer, in **minutes**. Min: 1, Max: 99,999 (≈69 days). |
| `logged_at` | date (ISO 8601) | No | Defaults to today. Cannot be in the future. |

**Behavior:**
- Creates a `Worklog` record associated with the issue, project, workspace, and requesting user.
- Triggers an `IssueActivity` record (field: `worklog`, verb: `created`) for the activity feed.
- Returns the created worklog object with all fields populated (including `id`, `created_at`, `created_by`).

**API Endpoint:**
```
POST /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/
```

**Response:** `201 Created` with serialized worklog.

---

### FR-2: List Worklogs

**Description:** Any user with read access to the issue can retrieve all worklogs.

**Behavior:**
- Returns a list of all worklogs for the specified issue.
- Ordered by `logged_at` descending (most recent first), then `created_at` descending.
- Includes the `actor` (user) information for each worklog (id, display_name, avatar).

**API Endpoint:**
```
GET /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/
```

**Response:** `200 OK` with array of serialized worklogs.

**Query Parameters (optional, future):**
| Param | Type | Description |
|-------|------|-------------|
| `created_at__gt` | ISO datetime | Filter worklogs created after this timestamp |

---

### FR-3: Total Time Aggregation

**Description:** Retrieve the total time logged on an issue.

**Behavior:**
- Returns the sum of `duration` (in minutes) for all worklogs on the issue.
- Returns `0` if no worklogs exist.

**API Endpoint:**
```
GET /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/total/
```

**Response:** `200 OK` with:
```json
{
  "total_duration": 480
}
```

---

### FR-4: Update Worklog

**Description:** A user can update their own worklog (or any worklog if Admin).

**Updatable Fields:**
| Field | Type | Constraints |
|-------|------|-------------|
| `description` | string | Max 10,000 characters |
| `duration` | integer | Positive, min 1, max 99,999 |
| `logged_at` | date | Cannot be in the future |

**Behavior:**
- Partial updates (PATCH) supported.
- Triggers an `IssueActivity` record (field: `worklog`, verb: `updated`).
- Members can only update their own worklogs. Admins can update any worklog.

**API Endpoint:**
```
PATCH /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/{worklog_id}/
```

**Response:** `200 OK` with serialized worklog.

---

### FR-5: Delete Worklog

**Description:** A user can delete their own worklog (or any worklog if Admin).

**Behavior:**
- Permanently deletes the worklog record.
- Triggers an `IssueActivity` record (field: `worklog`, verb: `deleted`).
- Members can only delete their own worklogs. Admins can delete any.

**API Endpoint:**
```
DELETE /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/{worklog_id}/
```

**Response:** `204 No Content`.

---

### FR-6: Issue Detail — Time Property

**Description:** The issue detail sidebar displays a "Time Logged" property showing the total duration.

**Behavior:**
- Renders in the issue detail sidebar alongside other properties (assignees, labels, priority, etc.).
- Shows total time in human-readable format: `Xh Ym` (e.g., `8h 30m`, `0h 15m`, `24h 0m`).
- If no time is logged, shows `0h 0m` or a placeholder like "No time logged".
- Clicking the property opens/scrolls to the worklog section or opens the creation form.
- Respects the `disabled` prop — when `true`, the property is read-only (no click action).

**Component:** `IssueWorklogProperty`
**Props:** `{ workspaceSlug: string, projectId: string, issueId: string, disabled: boolean }`

---

### FR-7: Activity Feed Integration

**Description:** Worklog entries appear in the issue's activity feed.

**Behavior:**
- Each worklog creation, update, or deletion generates an activity entry.
- The activity entry shows: actor avatar, actor name, action text ("logged Xh Ym", "updated a worklog", "removed a worklog"), and timestamp.
- For creation, the activity entry includes the duration and description.
- Worklog activities are interleaved chronologically with other activity types (comments, property changes, etc.).

**Component:** `IssueActivityWorklog`
**Props:** `{ workspaceSlug: string, projectId: string, issueId: string, activityComment: TIssueActivityComment, ends?: "top" | "bottom" }`

---

### FR-8: Activity Filter — Worklog Filter

**Description:** The activity filter dropdown includes a "Time logged" / "Worklogs" filter option.

**Behavior:**
- When the "Worklogs" filter is selected, only worklog activity entries are shown.
- When deselected, worklog entries are hidden from the feed.
- Integrates with the existing `ACTIVITY_FILTER_TYPE_OPTIONS` from `@plane/constants`.

**Component:** Updated `ActivityFilterRoot`

---

### FR-9: Worklog Creation UI

**Description:** A button in the activity section opens a form/modal for logging time.

**Behavior:**
- The button reads "Log time" with a clock/timer icon.
- Clicking opens an inline form or modal with:
  - **Duration input:** Hours and minutes fields (two number inputs), or a single field accepting `Xh Ym` format.
  - **Date picker:** Defaults to today. Cannot select future dates.
  - **Description:** Optional textarea (plain text).
  - **Submit button:** "Log time" — creates the worklog and closes the form.
  - **Cancel button:** Discards and closes.
- After successful creation, the new worklog appears in the activity feed and the total time property updates.
- The button is hidden when `disabled` is `true` (guest users without write access).

**Component:** `IssueActivityWorklogCreateButton` + new `WorklogForm`
**Props (button):** `{ workspaceSlug: string, projectId: string, issueId: string, disabled: boolean }`

---

## 5. Non-Functional Requirements

### NFR-1: Architecture Compliance

- **MUST NOT** modify any files in `apps/web/ce/` — the upstream CE stubs must remain untouched to preserve clean merges from `makeplane/plane`.
- **MUST** use the `apps/web/extended/` directory with `@/plane-web/*` alias pointing to `./extended/*`.
- **MUST** follow the existing `ProjectBaseModel` inheritance pattern for Django models.
- **MUST** follow the existing `APIService` pattern for frontend HTTP services.
- **MUST** follow the existing MobX observable store pattern.

### NFR-2: API Compatibility

- Internal API endpoints **SHOULD** follow the URL structure documented in Plane's public API docs for worklogs, to ease future migration to the Commercial Edition or v1 API exposure.
- Request/response payloads **SHOULD** match the shapes described in the [Plane API reference](https://docs.plane.so/api-reference/worklogs/overview) where applicable.

### NFR-3: Performance

- Listing worklogs for an issue **MUST** respond within 200ms for up to 1,000 worklogs per issue (p95, local network).
- Total time aggregation **MUST** be computed via a database `SUM` aggregate, not in application code.
- The frontend **SHOULD** cache worklog data per-issue in the MobX store to avoid redundant API calls within a session.

### NFR-4: Data Integrity

- Duration **MUST** be stored as a positive integer (minutes) in the database.
- `logged_at` **MUST** be a date (not datetime) — time tracking is day-level granularity.
- Deleting an issue **MUST** cascade-delete all associated worklogs.
- Deleting a user **SHOULD** preserve worklogs (set `created_by` to null via `SET_NULL`, retain the `actor` FK).

### NFR-5: Security

- All worklog endpoints **MUST** enforce project membership verification (same as existing issue endpoints).
- Members **MUST NOT** be able to update or delete worklogs created by other users (Admins may).
- All inputs **MUST** be validated server-side (duration range, date constraints, description length).

### NFR-6: TypeScript Strict Mode

- All new frontend code **MUST** pass TypeScript strict mode checks.
- All new types **MUST** be exported from `@plane/types`.
- No `any` types except in catch blocks.

### NFR-7: Testing

- Backend: Django unit tests for model validation, serializer validation, viewset CRUD, permission checks, and activity generation.
- Frontend: Component unit tests for rendering (worklog property, activity entry, creation form).
- Integration: End-to-end test for the full create → list → update → delete flow.

### NFR-8: Licensing

- All new code **MUST** include the AGPL-3.0 license header matching the existing project convention:
  ```
  # Copyright (c) 2023-present Plane Software, Inc. and contributors
  # SPDX-License-Identifier: AGPL-3.0-only
  # See the LICENSE file for details.
  ```

---

## 6. Out of Scope (v1)

The following are explicitly **not** part of the MVP and may be considered for future iterations:

| Feature | Rationale |
|---------|-----------|
| **Timer / Stopwatch** | Requires real-time state sync; high complexity. Can be added as a frontend-only enhancement later. |
| **Time Reports / Analytics** | Requires new analytics views and aggregation endpoints. Build on top of the data model later. |
| **Project-level time totals** | Requires cross-issue aggregation endpoints. |
| **Workspace-level dashboards** | Out of scope for issue-level MVP. |
| **Export (CSV/PDF)** | Can leverage the existing exporter infrastructure later. |
| **Estimate vs. Actual** | Requires integration with the existing estimate points system. |
| **Bulk worklog operations** | Low priority for MVP. |
| **API v1 (public/external)** | Internal API only for MVP; v1 can wrap the same viewset later. |
| **Webhook events** | Can add `model_activity` calls later (same pattern as comments). |
| **Worklog on archived issues** | Archived issues are read-only; no worklog creation allowed. |

---

## 7. Acceptance Criteria Summary

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-1 | A member can create a worklog with duration and optional description/date | API test + UI test |
| AC-2 | Worklogs are listed in descending order by logged_at on the issue activity feed | API test + UI test |
| AC-3 | Total time is displayed on the issue detail sidebar in `Xh Ym` format | UI test |
| AC-4 | Total time endpoint returns correct SUM of all worklog durations | API test |
| AC-5 | A member can edit their own worklog's duration, description, and date | API test + UI test |
| AC-6 | A member cannot edit or delete another member's worklog | API test (403) |
| AC-7 | An admin can edit or delete any worklog | API test |
| AC-8 | Deleting a worklog removes it and updates the total time | API test + UI test |
| AC-9 | Worklog CRUD operations generate IssueActivity records | API test |
| AC-10 | Guest users see the time logged property but cannot create/edit/delete worklogs | API test (403) + UI test |
| AC-11 | The `ce/` directory is completely unmodified | Git diff check |
| AC-12 | The app builds and passes `pnpm check` with no new errors | CI check |
| AC-13 | All new files include the AGPL-3.0 license header | Lint check |
| AC-14 | Duration validation rejects zero, negative, and excessively large values | API test (400) |
| AC-15 | `logged_at` validation rejects future dates | API test (400) |