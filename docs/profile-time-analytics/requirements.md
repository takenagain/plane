# Requirements: Your Work — Hours Logged / Time Tracking Analytics

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Draft — ready for implementation work packages

---

## 1. Overview

Add a new **Hours logged** tab to the workspace **Your work** profile dashboard (`/{workspaceSlug}/profile/{userId}`) that surfaces comprehensive, user-scoped time-tracking analytics. The experience should match the depth and interaction patterns of existing **Analytics → Customized Insights** (hours logged metric, dimensions, grouped bar chart, data table, CSV export) while being tailored to a single user’s worklogs across projects they can access.

Reference UI (current product):

- Profile dashboard tabs: Summary, Assigned, Created, Subscribed, Activity
- Analytics sidebar / modal: **Hours logged** × **Day of week** × **Work item** grouping with chart + table + export

---

## 2. Scope

### 2.1 In scope

| Area              | Description                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation        | New profile tab (route e.g. `/profile/{userId}/time`) with i18n label                                                                                    |
| Permissions       | View own data always; view others’ data only when viewer has workspace member access consistent with existing profile tabs                               |
| Date filters      | Same presets as workspace analytics where applicable: yesterday, last 7/30 days, last 3 months, custom range                                             |
| Project filter    | Optional multi-project filter limited to projects the **viewer** can access                                                                              |
| Core metrics      | Total hours, hours vs prior period, average per day, active timer inclusion (duration=0 elapsed)                                                         |
| Breakdowns        | Hours by: day of week, calendar week/month, project, module, cycle, work item type, priority, state group, top work items                                |
| Rankings          | Top N projects, modules, cycles, and work items by hours logged in period                                                                                |
| Customized chart  | Reuse analytics chart UX: metric/dimension/group selectors, bar chart, insight table, CSV export                                                         |
| Worklog context   | List recent worklogs with description snippets; link to work item                                                                                        |
| Comment signals   | Surface work items with recent comments on items the user logged time against; optional keyword highlight (blocked, bug, risk, etc.) — heuristic, not ML |
| Empty states      | Clear copy when user has no worklogs in range                                                                                                            |
| Performance       | Paginated/limit top-N endpoints; server-side aggregation                                                                                                 |
| Tests             | API unit tests, web component tests where patterns exist, E2E smoke for tab + chart load                                                                 |
| i18n              | All user-visible strings via `@plane/i18n` (English + existing locale files)                                                                             |
| Real-time updates | WebSocket events when profile subject starts/stops an active timer; KPI/chart refresh without full page reload                                           |

### 2.2 Out of scope (v1)

| Item                                     | Rationale                                                             |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Workspace-wide analytics for all members | Stays in Analytics sidebar; this feature is **per-user** on Your work |
| Editing worklogs from dashboard          | Use existing work item worklog UI                                     |
| Billing / invoicing / rates              | No hourly rate model today                                            |
| AI summarization of comments             | Heuristic keyword surfacing only                                      |
| Mobile-optimized bespoke layouts         | Responsive reuse of existing chart/table components acceptable        |
| Epic-only analytics mode                 | Unless trivial via existing `isEpic` patterns                         |

---

## 3. User stories

### 3.1 Discovery & access

| ID    | Story                                                                                                                                             | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| US-01 | As a workspace member viewing **my** profile, I see an **Hours logged** tab next to Summary / Assigned / Created / Subscribed / Activity.         | P0       |
| US-02 | As a member viewing **another user’s** profile (with existing profile permissions), I can open their **Hours logged** tab to see their analytics. | P0       |
| US-03 | As a guest or unauthorized viewer, I cannot access another user’s hours tab (same rules as Assigned/Created tabs).                                | P0       |

### 3.2 Summary & trends

| ID    | Story                                                                                                                                                     | Priority |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| US-10 | As a user, I see **total hours logged** for the selected date range with comparison to the previous equivalent period (e.g. last 7 days vs prior 7 days). | P0       |
| US-11 | As a user, I see **average hours per working day** in the range.                                                                                          | P1       |
| US-12 | As a user, I see a **hours by day of week** chart (Mon–Sun) matching Analytics behavior.                                                                  | P0       |
| US-13 | As a user, I see **hours over time** (by week or month) to spot trends.                                                                                   | P1       |

### 3.3 Dimensional breakdowns

| ID    | Story                                                                                                                | Priority |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| US-20 | As a user, I see hours broken down by **project** and can identify which projects consumed the most time.            | P0       |
| US-21 | As a user, I see hours by **module** and **cycle** where applicable.                                                 | P0       |
| US-22 | As a user, I see hours by **work item type**, **priority**, and **state group**.                                     | P1       |
| US-23 | As a user, I see a **top work items** table (identifier, title, project, hours, % of total).                         | P0       |
| US-24 | As a user, I can use **Customized Insights** controls (x-axis, y-axis=Hours logged, group_by) scoped to my worklogs. | P0       |

### 3.4 Export & drill-down

| ID    | Story                                                                                              | Priority |
| ----- | -------------------------------------------------------------------------------------------------- | -------- |
| US-30 | As a user, I can **export CSV** of the current chart/table view (reuse analytics export patterns). | P0       |
| US-31 | As a user, clicking a work item in a ranking row opens that work item (peek or navigate).          | P1       |

### 3.5 Worklog & comment context

| ID    | Story                                                                                                                            | Priority |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| US-40 | As a user, I see **recent worklogs** I created (date, duration, description, work item).                                         | P1       |
| US-41 | As a user, I see work items I logged time on that have **recent comments** from others, to spot discussion I may have missed.    | P2       |
| US-42 | As a user, comments matching configurable **attention keywords** (blocked, blocker, bug, urgent, etc.) are visually highlighted. | P2       |

### 3.6 Real-time active timers

| ID    | Story                                                                                                                                                        | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| US-50 | As a user on **Hours logged**, when the profile subject **starts or stops** a timer, KPI totals and charts update without manually refreshing the page.      | P0       |
| US-51 | As a user viewing a profile with an **active timer**, elapsed time in summary KPIs stays current (WebSocket start/stop + client tick while timer is active). | P1       |
| US-52 | When WebSocket is unavailable, the dashboard **falls back to periodic polling** so data does not stay stale indefinitely.                                    | P1       |

---

## 4. Functional requirements

### FR-01 Tab & routing

- Add tab config in `packages/constants/src/profile.ts` with route `time`, path `/time/`, i18n key `profile.tabs.time`.
- Register route in `apps/web/app/routes/core.ts`.
- Page component at `apps/web/app/(all)/[workspaceSlug]/(projects)/profile/[userId]/time/page.tsx`.
- Update profile `layout.tsx` authorized path check to include `time`.

### FR-02 Data scoping

- All aggregations MUST filter `Worklog` by `actor_id = profile userId` and `deleted_at IS NULL`.
- Issues/projects MUST be limited to those the **requesting user** can access (same project membership filters as `WorkspaceUserProfileStatsEndpoint`).
- Active timers (`duration = 0`) MUST count elapsed minutes from `created_at` (consistent with `build_time_logged_chart` and `annotate_issue_queryset_with_time_logged`).

### FR-03 API surface (new)

Base path (proposed):

`GET /api/workspaces/{slug}/user-time-analytics/{user_id}/`

| Endpoint suffix    | Purpose                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `summary/`         | Totals, period comparison, averages                                                         |
| `charts/`          | Query params: `x_axis`, `group_by`, `date_filter`, `project_ids` — returns `IChartResponse` |
| `rankings/`        | Query params: `dimension` (project\|module\|cycle\|work_item), `limit`, filters             |
| `worklogs/`        | Paginated recent worklogs                                                                   |
| `comment-signals/` | Work items with recent comments + optional keyword matches                                  |
| `export/`          | CSV export mirroring `TimeLoggedExportEndpoint` but user-scoped                             |

Permission: authenticated workspace member; target user must be active workspace member; viewer must pass same checks as profile stats.

### FR-04 Reuse of analytics engine

- Reuse `build_time_logged_chart()` for chart endpoint where possible by:
  1. Building issue queryset = issues with worklogs by target user in period, intersected with viewer-accessible projects.
  2. Passing `date_filter` on `worklogs.logged_at`.
- Reuse frontend: `AnalyticsBarChart`, `AnalyticsSelectParams`, `CustomizedInsights` patterns — extracted or wrapped for profile context (no workspace analytics store coupling).

### FR-05 UI layout

Dashboard sections (top → bottom):

1. **Filter bar** — date range, project multi-select
2. **KPI row** — total hours, delta vs previous period, avg/day, worklog count
3. **Customized insights** — full width
4. **Two-column grid** — rankings (projects / modules / cycles) + top work items table
5. **Trend chart** — hours by week/month
6. **Secondary row** — work item type / priority breakdowns
7. **Context panels** — recent worklogs; comment signals

### FR-06 Empty & error states

- No worklogs: illustration + CTA to log time on a work item.
- Partial data (e.g. no modules): hide or show empty section per existing analytics patterns.
- API errors: toast + retry via SWR.

---

## 5. Non-functional requirements

| ID     | Requirement                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| NFR-01 | p95 API response &lt; 2s for default 7-day range on workspaces with ≤10k worklogs per user                         |
| NFR-02 | Rankings endpoints default `limit=10`, max 50                                                                      |
| NFR-03 | CSV export MUST sanitize formula injection (reuse `_sanitize_csv_cell`)                                            |
| NFR-04 | No cross-user data leakage — enforce actor + project membership on every query                                     |
| NFR-05 | Accessible charts: color palette from `@plane/propel`; table keyboard navigable                                    |
| NFR-06 | SPDX headers on new files; `pnpm check` passes                                                                     |
| NFR-07 | Unit tests for aggregation helpers; extend `e2e/tests/analytics-hours-logged.spec.ts` or add profile-specific spec |

---

## 6. Acceptance criteria (release checklist)

- [ ] Hours logged tab visible and navigable from Your work profile
- [ ] Summary KPIs match sum of worklogs for selected range (manual spot-check)
- [ ] Day-of-week chart matches Analytics modal for same user/projects when filtered equivalently
- [ ] CSV export downloads with expected columns and non-zero hours when data exists
- [ ] Unauthorized users cannot access `/time` for other members
- [ ] i18n keys present in `en` and generated types updated
- [ ] Docker API unit tests green for new endpoints
- [ ] Starting/stopping a timer elsewhere updates Hours logged KPIs without full page refresh (WebSocket or polling fallback)

---

## 7. Dependencies & assumptions

- Time tracking / worklogs feature is enabled in deployment (existing `Worklog` model).
- `ChartXAxisProperty.WORK_ITEM_TYPES` may require backend `get_x_axis_field()` extension if not already supported for hours logged — verify in implementation.
- Profile subject is always identified by `userId` route param; compare to `useUser().id` for “own profile” UX nuances (optional badge).
