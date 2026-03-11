# Plane — Activation & Feature Gating Analysis

> **Last updated:** 2025-07-15
> **Purpose:** Document how Plane's activation/licensing mechanism works, how features are gated per edition, and evaluate approaches for enabling all features in the self-hosted Community Edition.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Instance Registration & Activation Flow](#2-instance-registration--activation-flow)
- [3. Edition Model](#3-edition-model)
- [4. Feature Gating Mechanisms](#4-feature-gating-mechanisms)
- [5. Detailed Feature Gate Inventory](#5-detailed-feature-gate-inventory)
- [6. Time Tracking (Worklog) Deep Dive](#6-time-tracking-worklog-deep-dive)
- [7. Bypass Approaches](#7-bypass-approaches)
- [8. Recommended Approach](#8-recommended-approach)
- [9. Implementation Roadmap](#9-implementation-roadmap)
- [10. Risk Assessment](#10-risk-assessment)
- [11. Reference Files](#11-reference-files)

---

## 1. Overview

Plane uses a **compile-time module substitution** architecture to gate features between its Community Edition (CE, open-source, AGPL-3.0) and its Commercial editions (Pro, Business, Enterprise — proprietary, closed-source). There is **no runtime license key validation** in the CE codebase — the code for paid features simply does not exist in this repository. Instead, CE ships stub/no-op implementations that render empty components and return disabled flags.

### Key Insight

**The Community Edition does not contain the paid feature code.** The gating is not a lock that can be unlocked — it is an absence of code. The `ce/` directory contains placeholder files that would need to be replaced with real implementations to gain feature parity.

This is fundamentally different from a license-key bypass scenario. The approach required is **implementing the missing features**, not circumventing a check.

---

## 2. Instance Registration & Activation Flow

### 2.1 Backend: Instance Registration

When the Django backend starts (via the migrator container), it runs:

```
python manage.py register_instance <machine_signature>
python manage.py configure_instance
```

**`register_instance`** (`apps/api/plane/license/management/commands/register_instance.py`):
1. Checks if an `Instance` record exists in the database
2. If not, creates one with:
   - `instance_name`: "Plane Community Edition"
   - `instance_id`: Random 12-byte hex token (locally generated, no external call)
   - `edition`: `InstanceEdition.PLANE_COMMUNITY` (= `"PLANE_COMMUNITY"`)
   - `current_version`: From `APP_VERSION` env var or `package.json`
   - `latest_version`: Fetched from GitHub releases API (best-effort, falls back gracefully)
3. If the instance already exists, updates version info and edition
4. Fires an `instance_traces` Celery task for telemetry (if enabled)

**`configure_instance`** (`apps/api/plane/license/management/commands/configure_instance.py`):
1. Iterates over `instance_config_variables` (from `plane/utils/instance_config_variables.py`)
2. Creates `InstanceConfiguration` records for each key (SMTP, OAuth, etc.)
3. Auto-detects OAuth provider availability from env vars

### 2.2 Instance Model

Defined in `apps/api/plane/license/models/instance.py`:

| Field                          | Type        | Default / Notes                              |
| ------------------------------ | ----------- | -------------------------------------------- |
| `instance_name`                | CharField   | "Plane Community Edition"                    |
| `instance_id`                  | CharField   | Random hex, locally generated                |
| `current_version`              | CharField   | From env/package.json                        |
| `latest_version`               | CharField   | From GitHub API (nullable)                   |
| `edition`                      | CharField   | `"PLANE_COMMUNITY"` (only option in CE)      |
| `is_telemetry_enabled`         | BooleanField| `True`                                       |
| `is_setup_done`                | BooleanField| `False` until admin completes setup          |
| `is_signup_screen_visited`     | BooleanField| `False`                                      |
| `is_verified`                  | BooleanField| `False` (no verification server in CE)       |
| `domain`                       | TextField   | Blank                                        |
| `is_current_version_deprecated`| BooleanField| `False`                                      |

The `InstanceEdition` enum only has one value in CE:

```python
class InstanceEdition(Enum):
    PLANE_COMMUNITY = "PLANE_COMMUNITY"
```

### 2.3 Frontend: Instance Info Endpoint

The `GET /api/instances/` endpoint (`apps/api/plane/license/api/views/instance.py`) returns:
- `is_activated: True` if an Instance record exists, `False` otherwise
- Instance metadata (name, version, edition)
- Configuration flags (signup enabled, OAuth providers, SMTP, etc.)
- `is_self_managed: True` (hardcoded in `apps/api/plane/settings/common.py`)

The frontend `InstanceStore` (`apps/web/core/store/instance.store.ts`) consumes this and stores it as observable MobX state.

### 2.4 What "Activation" Means in CE

In the Community Edition, "activation" simply means:
1. The instance has been registered (Instance record exists in DB)
2. An admin user has completed the setup wizard

There is **no license key validation**, **no external server phone-home for activation**, and **no cryptographic license check** in the CE codebase. The `license_key` field exists in the TypeScript types (`IInstance.license_key`) but is `undefined` in CE — it is only used in the Commercial Edition.

---

## 3. Edition Model

### 3.1 Subscription Tiers

Defined in `packages/types/src/payment.ts`:

```typescript
enum EProductSubscriptionEnum {
  FREE = "FREE",
  ONE = "ONE",        // Legacy tier
  PRO = "PRO",        // $8/user/mo
  BUSINESS = "BUSINESS",  // $15/user/mo
  ENTERPRISE = "ENTERPRISE",  // Contact sales
}
```

### 3.2 Edition Separation

The editions are **completely separate codebases** with no shared private code:

| Edition      | Repository                        | `@/plane-web/*` Resolves To |
| ------------ | --------------------------------- | --------------------------- |
| Community    | `github.com/makeplane/plane`      | `./ce/*` (stubs)            |
| Commercial   | Private repository                | Real feature implementations |
| Airgapped    | Private repository                | Same as Commercial           |

The `apps/web/tsconfig.json` alias is the switching mechanism:

```json
{
  "paths": {
    "@/plane-web/*": ["./ce/*"]
  }
}
```

In the Commercial Edition, this would point to a different directory (e.g., `./ee/*` or `./commercial/*`) containing full implementations.

### 3.3 Self-Hosted Upgrade Path (Official)

Per the [Plane docs](https://docs.plane.so/self-hosting/upgrade-from-community):
1. Install the **Commercial Edition** on a fresh machine (different Docker images)
2. Back up CE data (pgdata, redisdata, uploads)
3. Restore data into the Commercial Edition
4. Purchase a license via the Prime portal
5. Activate using a license key in **Workspace Settings > Billing and plans**

---

## 4. Feature Gating Mechanisms

Plane uses **three layers** of feature gating:

### Layer 1: Compile-Time Module Substitution (Primary)

The `@/plane-web/*` TypeScript path alias resolves to `./ce/*` in Community Edition. All imports of edition-specific code go through this alias:

```typescript
// In core code (e.g., core/components/issues/issue-detail/...)
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
```

In CE, this resolves to an empty component. In Commercial, it resolves to the real implementation.

**Scope:** ~118+ files across components, hooks, stores, and types.

### Layer 2: Feature Flag Hooks (Secondary)

Several hooks in `ce/hooks/` return hardcoded `false` or empty config:

| Hook                        | CE Return Value                                     |
| --------------------------- | --------------------------------------------------- |
| `useBulkOperationStatus`    | `false`                                             |
| `usePageFlag`               | `{ isMovePageEnabled: false, isPageSharingEnabled: false }` |
| `useEditorFlagging`         | Disables `ai` and `collaboration-cursor` extensions |
| `useWorkItemProperties`     | `undefined` (no-op)                                 |

### Layer 3: Upgrade Modal (UI Gate)

The `ce/components/license/modal/upgrade-modal.tsx` renders a modal that:
1. Shows the current "Free" plan
2. Lists Pro, Business, and Enterprise plans with features/pricing
3. Links out to `app.plane.so/upgrade/...` for self-hosted upgrade
4. Sets `isSelfHosted = true` and `isTrialAllowed = false`

This modal is triggered when users attempt to use paid features.

### What Is NOT Present (Backend)

There is **no backend middleware** that checks subscription status before allowing API calls. The backend `plane.license` module handles:
- Instance registration (local, no external validation)
- Instance configuration (SMTP, OAuth, etc.)
- Admin permissions
- Telemetry

It does **not** contain:
- License key validation logic
- Feature flag endpoints based on subscription
- API endpoint restrictions based on plan tier
- Subscription status middleware

This confirms that the Commercial Edition has an entirely separate backend codebase with additional API endpoints, middleware, and models for subscription management.

---

## 5. Detailed Feature Gate Inventory

### 5.1 Components Stubbed in CE

| Feature Area              | CE Stub Location                                        | Paid Tier |
| ------------------------- | ------------------------------------------------------- | --------- |
| **Time Tracking**         | `ce/components/issues/worklog/property/root.tsx`        | Pro       |
| **Time Tracking Activity**| `ce/components/issues/worklog/activity/root.tsx`        | Pro       |
| **Worklog Create Button** | `ce/components/issues/worklog/activity/worklog-create-button.tsx` | Pro |
| **Bulk Operations**       | `ce/components/issues/bulk-operations/`                 | Pro       |
| **Workflows**             | `ce/components/workflow/`                               | Business  |
| **Gantt Dependencies**    | `ce/components/gantt-chart/dependency/`                 | Pro       |
| **Epics**                 | `ce/components/epics/epic-modal/`                       | Business  |
| **Active Cycle**          | `ce/components/cycles/active-cycle/`                    | One/Pro   |
| **Cycle Analytics**       | `ce/components/cycles/analytics-sidebar/`               | Pro       |
| **End Cycle**             | `ce/components/cycles/end-cycle/`                       | Pro       |
| **AI Editor**             | `ce/components/pages/editor/ai/`                        | Pro       |
| **Page Embeds**           | `ce/components/pages/editor/embed/`                     | Pro       |
| **Page Modals**           | `ce/components/pages/modals/`                           | Pro       |
| **Page Navigation**       | `ce/components/pages/navigation-pane/`                  | Pro       |
| **Issue Deduplication**   | `ce/components/de-dupe/duplicate-modal/`                | Business  |
| **Dedup Popover**         | `ce/components/de-dupe/duplicate-popover/`              | Business  |
| **View Publishing**       | `ce/components/views/publish/`                          | Pro       |
| **Billing UI**            | `ce/components/workspace/billing/`                      | All Paid  |
| **Upgrade Modal**         | `ce/components/license/modal/upgrade-modal.tsx`         | N/A       |
| **Issue Details (Extra)** | `ce/components/issues/issue-details/`                   | Pro       |
| **Issue Properties Act.** | `ce/components/issues/issue-details/issue-properties-activity/` | Pro |
| **Quick Add (Extra)**     | `ce/components/issues/quick-add/`                       | Pro       |
| **Empty States (Extra)**  | `ce/components/issues/issue-layouts/empty-states/`      | Pro       |
| **Quick Actions (Extra)** | `ce/components/issues/issue-layouts/quick-action-dropdowns/` | Pro  |
| **Issue Modal (Extra)**   | `ce/components/issues/issue-modal/`                     | Pro       |
| **Comments (Extra)**      | `ce/components/comments/`                               | Pro       |
| **Estimates (Extended)**  | `ce/components/estimates/`                              | Pro       |
| **Desktop Helper**        | `ce/components/desktop/`                                | Pro       |
| **Navigations**           | `ce/components/navigations/`                            | Pro       |
| **App Rail**              | `ce/components/app-rail/`                               | Pro       |
| **Home (Extended)**       | `ce/components/home/`                                   | Pro       |
| **Global (Extended)**     | `ce/components/global/`                                 | Pro       |
| **Instance (Extended)**   | `ce/components/instance/`                               | Pro       |
| **Sidebar (Extended)**    | `ce/components/sidebar/`                                | Pro       |
| **Workspace Members**     | `ce/components/workspace/members/`                      | Pro       |
| **Workspace Notifications**| `ce/components/workspace-notifications/`               | Pro       |
| **Editor Mentions**       | `ce/components/editor/embeds/mentions/`                 | Pro       |
| **Command Palette (Extra)**| `ce/components/command-palette/`                       | Pro       |

### 5.2 Stores Stubbed in CE

| Store                              | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `ce/store/root.store.ts`           | Minimal root store extension               |
| `ce/store/issue/epic/`             | Epic filter + issue stores (empty)         |
| `ce/store/issue/team/`             | Team issue filter + stores (empty)         |
| `ce/store/issue/team-project/`     | Team-project issue stores (empty)          |
| `ce/store/issue/team-views/`       | Team view issue stores (empty)             |
| `ce/store/issue/helpers/`          | Extended issue store helpers               |
| `ce/store/issue/issue-details/`    | Extended issue detail stores               |
| `ce/store/issue/workspace/`        | Extended workspace issue store             |
| `ce/store/member/`                 | Extended project member store              |
| `ce/store/pages/`                  | Extended page stores                       |
| `ce/store/timeline/`               | Timeline/Gantt stores                      |
| `ce/store/user/permission.store.ts`| Extended permission management             |
| `ce/store/workspace/`              | Extended workspace store                   |
| `ce/store/cycle/`                  | Extended cycle store                       |
| `ce/store/estimates/`              | Extended estimates store                   |

### 5.3 Hooks Stubbed in CE

| Hook                                  | Returns                              |
| ------------------------------------- | ------------------------------------ |
| `use-bulk-operation-status.ts`        | `false`                              |
| `use-page-flag.ts`                    | Move/sharing disabled                |
| `use-editor-flagging.ts`             | AI + collab-cursor disabled          |
| `use-issue-properties.tsx`            | `undefined`                          |
| `use-timeline-chart.ts`              | Empty timeline config                |
| `use-file-size.ts`                    | Default file size logic              |
| `use-additional-favorite-item-details.ts` | Empty favorite details           |
| `use-debounced-duplicate-issues.tsx`  | Empty dedup logic                    |
| `use-issue-embed.tsx`                 | Empty embed logic                    |
| `use-notification-preview.tsx`        | Basic notification preview           |
| `use-workspace-issue-properties-extended.tsx` | Empty extended properties    |
| `use-additional-editor-mention.tsx`   | Empty mention config                 |
| `use-extended-editor-config.ts`       | Basic editor config                  |

---

## 6. Time Tracking (Worklog) Deep Dive

Time tracking is a commonly requested feature gated behind the **Pro plan**.

### 6.1 What Exists in CE

**Frontend stubs (render nothing):**
- `ce/components/issues/worklog/property/root.tsx` → `<></>`
- `ce/components/issues/worklog/activity/root.tsx` → `<></>`
- `ce/components/issues/worklog/activity/worklog-create-button.tsx` → `<></>`
- `ce/components/issues/worklog/activity/filter-root.tsx` → Basic activity filter (no worklog filter)

**What's missing:**
- Worklog creation/edit/delete UI components
- Worklog property display on issue cards and detail views
- Worklog API service wrappers
- Worklog MobX store
- Worklog database models (in the Django backend)
- Worklog API endpoints
- Worklog activity tracking

### 6.2 What the API Docs Reveal

The [Plane Developer Docs](https://docs.plane.so/api-reference/worklogs/overview) describe a worklogs API with these endpoints:
- `POST /api/v1/workspaces/{slug}/projects/{id}/issues/{id}/worklogs/` — Create worklog
- `GET /api/v1/workspaces/{slug}/projects/{id}/issues/{id}/worklogs/` — List worklogs for issue
- `GET /api/v1/workspaces/{slug}/projects/{id}/issues/{id}/worklogs/total/` — Get total time
- `PATCH /api/v1/workspaces/{slug}/projects/{id}/issues/{id}/worklogs/{id}/` — Update worklog
- `DELETE /api/v1/workspaces/{slug}/projects/{id}/issues/{id}/worklogs/{id}/` — Delete worklog

These endpoints **do not exist** in the CE backend codebase. They are part of the Commercial Edition's additional API layer.

### 6.3 What Would Be Needed to Implement Time Tracking

**Backend (Django):**
1. `Worklog` model (likely: id, issue FK, user FK, description, duration, logged_at, created/updated timestamps)
2. Serializer for the Worklog model
3. ViewSet with CRUD + total time aggregation
4. URL routing under the issues endpoint
5. Migration files
6. Activity tracking integration

**Frontend:**
1. `WorklogService` in `@plane/services` (API client wrapper)
2. `WorklogStore` MobX store (CRUD operations, observable state)
3. `IssueWorklogProperty` component (display total time on issues)
4. `IssueActivityWorklog` component (show worklogs in activity feed)
5. `IssueActivityWorklogCreateButton` component (create new worklog)
6. Worklog creation/edit modal or form
7. Activity filter integration for worklog entries
8. Types in `@plane/types`

---

## 7. Bypass Approaches

### Approach A: Replace CE Stubs with Custom Implementations

**Strategy:** Write real implementations for each `ce/` stub file and keep them in the `ce/` directory.

**Pros:**
- Completely self-contained; no external dependencies
- Full control over feature implementation
- Can prioritise which features to implement (e.g., time tracking first)
- No risk of legal issues — you're writing new AGPL-3.0 code, not using proprietary code

**Cons:**
- Significant development effort (~118+ frontend files + backend API work)
- Must build and maintain backend API endpoints that don't exist in CE
- No guarantee of API compatibility with Commercial Edition
- Ongoing maintenance burden as upstream CE evolves

**Estimated effort for time tracking alone:** 3-5 days for a working MVP (backend model + API + frontend CRUD + activity integration).

### Approach B: Switch to Commercial Edition (Official Path)

**Strategy:** Follow Plane's official upgrade path — install Commercial Edition, migrate data, purchase license.

**Pros:**
- Immediate access to all features
- Officially supported
- No custom code maintenance
- 12 free user seats per workspace

**Cons:**
- Costs money ($8-15/user/mo for Pro/Business)
- Closed-source — no code audit capability
- Locked into Plane's release cycle and pricing
- Requires fresh installation + data migration

### Approach C: Hybrid — Implement Backend + Swap Frontend Module Path

**Strategy:**
1. Build the missing backend API endpoints in the CE Django app
2. Create a parallel directory (e.g., `apps/web/ee/` or `apps/web/extended/`) with real implementations
3. Update `tsconfig.json` to point `@/plane-web/*` to the new directory

**Pros:**
- Clean separation from CE stubs
- Can selectively implement high-value features
- Easier to merge upstream CE updates (stubs directory untouched)
- Can use the CE stubs as interface contracts

**Cons:**
- Same development effort as Approach A
- Slightly more complex directory structure
- Must ensure the new directory maintains the same export signatures as `ce/`

### Approach D: Feature Flag Override (Partial — Hooks Only)

**Strategy:** Modify only the `ce/hooks/` files to return `true`/enabled values.

**Pros:**
- Minimal code changes (~10 files)
- Quick to implement

**Cons:**
- **Does not work for most features** — the components still render `<></>` (empty)
- Only unlocks features where the core code conditionally renders based on hook values
- The actual feature UI/logic is still absent
- Backend APIs are still missing

**Verdict:** This alone is insufficient. Changing `useBulkOperationStatus` to return `true` would only work if the core component conditionally renders bulk ops based on this hook — and even then, the bulk ops component from `ce/` still renders nothing.

### Approach E: Use the Public API + External Tools

**Strategy:** For features like time tracking, use Plane's public API (v1) to build an external integration or browser extension.

**Pros:**
- Zero modifications to Plane codebase
- No merge conflicts with upstream
- Can be as simple as a script or CLI tool

**Cons:**
- Poor UX compared to native integration
- Limited to what the v1 API exposes (worklogs API may not exist in CE)
- Requires separate deployment/maintenance

---

## 8. Recommended Approach

### Primary Recommendation: Approach C (Hybrid Implementation)

This is the most maintainable and flexible approach:

1. **Create `apps/web/extended/` directory** mirroring the `ce/` structure
2. **Update `tsconfig.json`:**
   ```json
   {
     "paths": {
       "@/plane-web/*": ["./extended/*"]
     }
   }
   ```
3. **Copy all `ce/` files to `extended/`** as a starting point
4. **Implement features incrementally**, starting with highest value (time tracking)
5. **Build corresponding backend API endpoints** in the Django app

### Why This Approach

- **Clean git history:** The `ce/` directory remains untouched, making upstream merges trivial
- **Incremental:** You can start with just time tracking and add more features over time
- **Reversible:** Changing the tsconfig path back to `./ce/*` reverts to stock CE behaviour
- **Interface contracts:** The `ce/` stubs serve as type-safe contracts — your implementations must match the same exports

### For Time Tracking Specifically

The fastest path to usable time tracking:

1. **Backend:** Add a `Worklog` model + ViewSet in `apps/api/plane/app/` (not `plane/license/`)
2. **Frontend:** Implement the 3 worklog component stubs + create a WorklogStore
3. **Wire up:** Add the worklog service to `@plane/services`, store to root store

### Configuration Change (Backend — Optional)

To present the instance as a higher edition (cosmetic only, does not unlock code that doesn't exist):

```python
# apps/api/plane/license/models/instance.py
class InstanceEdition(Enum):
    PLANE_COMMUNITY = "PLANE_COMMUNITY"
    PLANE_PRO = "PLANE_PRO"           # Add if needed
    PLANE_BUSINESS = "PLANE_BUSINESS"  # Add if needed
```

This would only matter if you add backend code that checks `instance.edition`.

---

## 9. Implementation Roadmap

### Phase 1: Foundation (1 day)
- [ ] Create `apps/web/extended/` by copying `apps/web/ce/`
- [ ] Update `apps/web/tsconfig.json` to point `@/plane-web/*` → `./extended/*`
- [ ] Verify the app builds and runs identically to stock CE
- [ ] Update `apps/web/vite.config.ts` if any path resolution issues arise

### Phase 2: Time Tracking Backend (2-3 days)
- [ ] Create `Worklog` model in `apps/api/plane/db/models/`
- [ ] Create migration
- [ ] Create serializer in `apps/api/plane/app/serializers/`
- [ ] Create ViewSet in `apps/api/plane/app/views/`
- [ ] Add URL routes in `apps/api/plane/app/urls/`
- [ ] Add activity tracking for worklog CRUD
- [ ] Test API endpoints

### Phase 3: Time Tracking Frontend (2-3 days)
- [ ] Add `IWorklog` type to `packages/types/src/`
- [ ] Create `WorklogService` in `packages/services/src/`
- [ ] Create `WorklogStore` MobX store
- [ ] Implement `IssueWorklogProperty` in `extended/components/issues/worklog/property/root.tsx`
- [ ] Implement `IssueActivityWorklog` in `extended/components/issues/worklog/activity/root.tsx`
- [ ] Implement `IssueActivityWorklogCreateButton`
- [ ] Create worklog creation/edit form
- [ ] Wire into root store and issue detail view

### Phase 4: Additional Features (ongoing)
- [ ] Enable feature flag hooks (bulk ops, page sharing, etc.)
- [ ] Implement bulk operations UI
- [ ] Implement extended editor features
- [ ] Implement workflow components
- [ ] Implement enhanced Gantt chart dependencies

---

## 10. Risk Assessment

| Risk                                  | Severity | Mitigation                                           |
| ------------------------------------- | -------- | ---------------------------------------------------- |
| **Upstream merge conflicts**          | Medium   | Keep `ce/` untouched; only modify `extended/`        |
| **API contract drift**                | Low      | CE stubs serve as interface contracts                |
| **Missing backend endpoints**         | High     | Must build from scratch; use API docs as reference   |
| **AGPL license compliance**           | Low      | All new code is your own; CE is AGPL-3.0 already    |
| **Maintenance burden**                | Medium   | Limit scope to highest-value features                |
| **Database schema divergence**        | Medium   | Use Django migrations; keep models simple            |
| **Commercial Edition compatibility**  | N/A      | This approach is CE-only; not compatible with Commercial |

---

## 11. Reference Files

### Backend (Django API)

| File                                                              | Purpose                            |
| ----------------------------------------------------------------- | ---------------------------------- |
| `apps/api/plane/license/models/instance.py`                      | Instance + InstanceConfiguration models |
| `apps/api/plane/license/management/commands/register_instance.py` | Instance registration command      |
| `apps/api/plane/license/management/commands/configure_instance.py`| Instance configuration command     |
| `apps/api/plane/license/api/views/instance.py`                   | Instance info GET/PATCH endpoints  |
| `apps/api/plane/license/api/permissions/instance.py`             | InstanceAdminPermission class      |
| `apps/api/plane/license/utils/encryption.py`                     | Fernet encryption for config values|
| `apps/api/plane/license/utils/instance_value.py`                 | Config value resolution (DB vs env)|
| `apps/api/plane/license/bgtasks/tracer.py`                       | Telemetry background task          |
| `apps/api/plane/settings/common.py`                              | Django settings (IS_SELF_MANAGED=True) |

### Frontend (Web App)

| File                                                              | Purpose                            |
| ----------------------------------------------------------------- | ---------------------------------- |
| `apps/web/tsconfig.json`                                         | Path aliases (`@/plane-web/*` → `./ce/*`) |
| `apps/web/vite.config.ts`                                        | Vite build configuration           |
| `apps/web/core/store/root.store.ts`                              | CoreRootStore (all editions)       |
| `apps/web/ce/store/root.store.ts`                                | CE RootStore extension             |
| `apps/web/core/store/instance.store.ts`                          | Instance info MobX store           |
| `apps/web/ce/components/license/modal/upgrade-modal.tsx`         | Upgrade nag modal                  |
| `apps/web/ce/components/issues/worklog/property/root.tsx`        | Time tracking property stub        |
| `apps/web/ce/components/issues/worklog/activity/root.tsx`        | Time tracking activity stub        |
| `apps/web/ce/hooks/use-bulk-operation-status.ts`                 | Bulk ops feature flag (→ false)    |
| `apps/web/ce/hooks/use-page-flag.ts`                             | Page feature flags (→ disabled)    |
| `apps/web/ce/hooks/use-editor-flagging.ts`                       | Editor extension flags             |

### Shared Packages

| File                                          | Purpose                                    |
| --------------------------------------------- | ------------------------------------------ |
| `packages/types/src/payment.ts`               | EProductSubscriptionEnum + payment types   |
| `packages/types/src/instance/base.ts`         | IInstance, IInstanceConfig interfaces      |
| `packages/constants/src/payment.ts`           | Plan pricing, product definitions, URLs    |
| `packages/constants/src/subscription.ts`      | Feature lists per tier                     |
| `packages/constants/src/instance.ts`          | EInstanceStatus enum                       |

### Admin App

| File                                          | Purpose                                    |
| --------------------------------------------- | ------------------------------------------ |
| `apps/admin/store/instance.store.ts`          | Admin instance MobX store                  |
| `apps/admin/components/instance/setup-form.tsx`| Instance setup wizard form                |