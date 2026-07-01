# Plane Self-Hosted Feature Review Report

**Date:** 2026-05-29  
**Repository:** `/home/frannas/repos/personal/plane` (AGPL-3.0 open-source tree)  
**Reference tiers:** [Plane self-hosted pricing](https://plane.so/pricing?mode=self-hosted) (Free / Pro $6 / Business $13 / Enterprise)  
**Comparison target:** Full Pro/Business commercial self-hosted release (closed-source modules + license)

---

## Executive summary

This codebase is the **open-source Plane monorepo**. Commercial Pro/Business capabilities are delivered through a combination of:

1. **License-gated features** (documented in product pricing and `packages/constants/src/subscription.ts`).
2. **Compile-time edition overlays** via `@/plane-web/*` (`apps/web/ce/` vs `apps/web/extended/`).
3. **Backend modules not present in this tree** (notably integration REST APIs for GitHub/Sentry sync).

**Build configuration in this repo:** `apps/web/tsconfig.json` resolves `@/plane-web/*` → `./extended/*` (not `ce/`). That means the active web build uses the **extended** overlay, which is **not identical** to upstream Community Edition stubs—but many extended files are still no-ops or upgrade banners.

| Area                                                           | vs Pro/Business expectation                            |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| Core PM (projects, work items, cycles, modules, project pages) | **Largely present**                                    |
| Work item export (CSV/XLSX/JSON)                               | **Present** (workspace settings)                       |
| Auto-transfer cycle work items                                 | **Present** (API + UI + Celery; Pro-tier commercially) |
| Time tracking / worklogs                                       | **API present**; UI in `extended/` (stubs in `ce/`)    |
| Wiki (workspace-wide)                                          | **Missing** (schema hints + i18n only)                 |
| GitHub issue/PR sync integration                               | **Missing backend** (models + UI shell only)           |
| Sentry → work item integration                                 | **Missing** (i18n only)                                |
| Bulk ops, epics, teamspaces, workflows                         | **Stubbed or upgrade-only**                            |

---

## Methodology

1. Parsed the [self-hosted pricing feature matrix](https://plane.so/pricing?mode=self-hosted) (May 2026).
2. Mapped features to code via `apps/web/core/constants/plans.tsx`, `docs/ARCHITECTURE.md`, and targeted ripgrep.
3. Compared **expected product behavior** using [Plane docs](https://docs.plane.so/) (GitHub, Sentry, Pages).
4. Classified each feature: **Present**, **Partial**, **Stub**, or **Absent**.
5. Cross-checked user-provided pricing screenshots (Free tier: integrations/wiki/advanced export marked unavailable).

---

## Edition and gating architecture

```text
apps/web/core/          ← shared application logic (all editions)
apps/web/ce/            ← Community stubs (empty components, false flags)
apps/web/extended/      ← This repo’s active alias target (mixed: some real, many stubs)
Commercial (not in repo) ← Full implementations + integration API package
```

| Mechanism             | Location                                  | Effect                                          |
| --------------------- | ----------------------------------------- | ----------------------------------------------- |
| `@/plane-web/*` alias | `apps/web/tsconfig.json` → `./extended/*` | Swaps edition-specific modules at build time    |
| Plan comparison UI    | `apps/web/core/constants/plans.tsx`       | Marketing matrix; not runtime enforcement       |
| Instance license      | `apps/api/plane/license/`                 | Edition/key for self-hosted commercial installs |
| Upgrade banners       | `ce/` and often `extended/`               | Shows paywall instead of feature                |

**Important:** AGPL code can contain **backend logic** for Pro features (e.g. cycle auto-transfer) while the **commercial product** still lists them under Pro. Self-hosted Free tier availability is a **license/business** restriction, not always a code absence.

---

## Feature matrix (pricing → codebase)

Legend: ✅ Present · ⚠️ Partial · 🚫 Stub/absent · 💰 Commercial/license only (per pricing)

### Core project management

| Feature (pricing)                      | Free (SH) | Pro            | Business       | Codebase status | Notes                                                                                                    |
| -------------------------------------- | --------- | -------------- | -------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| Projects & work items                  | ✅        | ✅             | ✅             | ✅              | Core `apps/api` + `apps/web/core`                                                                        |
| Cycles & modules                       | ✅        | ✅             | ✅             | ✅              | Full                                                                                                     |
| Project Pages                          | ✅        | ✅             | ✅             | ✅              | Routes under `projects/.../pages/`                                                                       |
| Estimates                              | Basic     | Advanced       | Advanced       | ⚠️              | Project-level estimates exist; “advanced” tier unclear in OSS                                            |
| Layouts (5)                            | ✅        | ✅             | ✅             | ✅              | List, board, calendar, gantt, spreadsheet                                                                |
| Views                                  | Basic     | Public+Private | Public+Private | ⚠️              | Views exist; publish/private tiers partially stubbed (`ce/components/views/publish/`)                    |
| Publish views                          | 🚫        | ✅             | ✅             | 🚫              | Publish modal stub                                                                                       |
| Bulk ops                               | 🚫        | ✅             | ✅+            | 🚫              | `IssueBulkOperationsRoot` → upgrade banner only                                                          |
| Active cycles                          | 🚫        | ✅             | ✅             | 🚫              | `active-cycle/` stubs in ce/extended                                                                     |
| Timeline dependencies                  | 🚫        | ✅             | ✅             | 🚫              | Gantt dependency paths stub                                                                              |
| **Auto-transfer cycle work items**     | 🚫        | ✅             | ✅             | ✅              | **Implemented in OSS:** `auto_transfer_cycle_issues`, `cycle_automation_task.py`, settings UI, e2e tests |
| Epics                                  | 🚫        | ✅             | ✅             | 🚫              | `CreateUpdateEpicModal` returns empty in **both** ce and extended                                        |
| Initiatives                            | 🚫        | ✅             | ✅             | 🚫              | Not found in OSS UI                                                                                      |
| Project overview / module overview     | 🚫        | ✅             | ✅             | ⚠️              | Analytics/overview partial                                                                               |
| Public/private/secret projects         | 🚫        | ✅             | ✅             | ⚠️              | Basic project visibility; “secret” not verified                                                          |
| Recurring work items                   | 🚫        | 🚫             | ✅             | ⚠️              | `recurrence.helpers.ts` in extended; scope unclear                                                       |
| Cycle manual start/stop, auto-schedule | 🚫        | ✅             | ✅             | ⚠️              | Auto-create cycles ✅; manual start/stop not fully verified                                              |
| Progress overview                      | ✅        | ✅             | ✅             | ⚠️              | Partial via analytics                                                                                    |

### Advanced project management

| Feature                             | Pro            | Business | Codebase                          |
| ----------------------------------- | -------------- | -------- | --------------------------------- | --------------------------------------------------------- |
| Work item types & custom properties | ✅             | ✅       | 🚫 / upgrade patterns in extended |
| Work item & project templates       | ✅             | ✅       | 🚫                                | Template UI largely stub                                  |
| Teamspaces                          | ✅             | ✅       | 🚫                                | `ProjectTeamspaceList` → `null`                           |
| Dashboards & widgets                | Basic/Advanced | Advanced | ⚠️                                | Analytics dashboards exist; “advanced widgets” not in OSS |
| Custom SLAs                         | ✅             | ✅       | 🚫                                | Not in OSS API                                            |
| Cycle progress charts               | ✅             | ✅       | 🚫                                | Burn-down style charts not found                          |

### Workflows & automation

| Feature                                                   | Pro | Business          | Codebase |
| --------------------------------------------------------- | --- | ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Time tracking + worklogs                                  | ✅  | ✅+approvals      | ⚠️       | **API:** `apps/api/plane/app/views/issue/worklog.py`, model `Worklog`. **UI:** full in `extended/components/issues/worklog/`, **stub** in `ce/` |
| Workflows + approvals                                     | 🚫  | Single / Multiple | 🚫       | `WorkFlowDisabledOverlay` empty                                                                                                                 |
| Trigger & action automations                              | ✅  | ✅                | 🚫       | Not in OSS                                                                                                                                      |
| Advanced pages analytics                                  | ✅  | ✅                | 🚫       | Not found                                                                                                                                       |
| **Advanced exports** (filtered CSV/Excel/JSON from views) | ✅  | ✅                | ⚠️       | Workspace export ✅; “from view with filters” commented out in `export-form.tsx`                                                                |

### Knowledge management

| Feature                                                                      | Pro       | Business | Codebase |
| ---------------------------------------------------------------------------- | --------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Wiki** (workspace-wide, no project)                                        | ✅        | ✅       | 🚫       | No `/wiki` app routes; `Page.is_global` exists but unused in page views; `WorkspaceAppSwitcher` stub; wiki i18n + assets only |
| Real-time collab on pages                                                    | ✅        | ✅       | 🚫       | `use-editor-flagging` disables `collaboration-cursor` in **both** ce and extended; `apps/live` exists for commercial          |
| Work item embeds, link-to-work-items                                         | ✅        | ✅       | 🚫       | `use-issue-embed` stub                                                                                                        |
| Publish pages                                                                | ✅        | ✅       | 🚫       | Publish stub                                                                                                                  |
| Page templates, versions                                                     | ✅        | ✅       | 🚫       | `use-page-flag` returns false                                                                                                 |
| Page exports (PDF/Word)                                                      | Queued    | Queued   | ⚠️       | `ExportPageModal` (PDF/markdown) in core—client-side; not queued server export                                                |
| Enhanced search, nested pages, shared pages, page comments, wiki collections | Business+ | ✅       | 🚫       | i18n keys for `wiki_collections` only—no implementation                                                                       |

**Product Pages (Free):** Project-scoped documentation works. **Workspace Wiki (Pro)** is a separate app surface—not implemented here.

### Intake & customers

| Feature              | Free | Pro | Business | Codebase                |
| -------------------- | ---- | --- | -------- | ----------------------- |
| Intake in-app        | ✅   | ✅  | ✅       | ✅                      |
| Intake forms / email | 🚫   | 🚫  | ✅       | 🚫 / partial intake API |
| Customers            | 🚫   | 🚫  | ✅       | 🚫                      |

### Security & access

| Feature        | Free (SH) | Pro+       | Codebase                                                             |
| -------------- | --------- | ---------- | -------------------------------------------------------------------- |
| Seat limit     | 12 users  | Unlimited  | 💰 License/instance (not enforced in AGPL UI alone)                  |
| SAML/OIDC/LDAP | 🚫        | Enterprise | ⚠️ OAuth GitHub/Google etc. for **login**; enterprise SSO not in OSS |
| RBAC/GAC       | Basic     | Business+  | ⚠️ Basic roles; custom RBAC not in OSS                               |

### Importers (from screenshots + pricing)

| Importer                                  | Free (SH) | Codebase                                                                             |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Jira, Linear, Asana, ClickUp, CSV         | ✅        | ⚠️ Models + frontend services; **no** `importers` URLs in `apps/api/plane/app/urls/` |
| Confluence, Notion, workspace members CSV | 🚫        | 🚫                                                                                   |

### Integrations (from screenshots + pricing)

| Integration                | Free (SH) | Pro+ | Codebase                                                                                                                                                                                      |
| -------------------------- | --------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub** (issue/PR sync) | 🚫        | ✅   | ⚠️ **Partial:** DB models (`GithubRepository`, `GithubIssueSync`, …), UI (`integrations/page.tsx`, `github/select-repository.tsx`), `GithubIntegrationService` calling **missing** API routes |
| GitHub Enterprise          | 🚫        | ✅   | 🚫                                                                                                                                                                                            |
| GitLab, Slack              | 🚫        | ✅   | ⚠️ Slack model + UI card; no API views in OSS                                                                                                                                                 |
| **Sentry**                 | 🚫        | ✅   | 🚫 **Absent:** only `packages/i18n/.../integration.json` strings                                                                                                                              |
| Draw.io                    | 🚫        | ✅   | 🚫                                                                                                                                                                                            |

**GitHub OAuth** for **sign-in** exists (`plane.authentication.provider.oauth.github`)—distinct from **GitHub integration** for issue sync ([docs](https://docs.plane.so/integrations/github)).

---

## Deep dive: five priority features

### 1. Wiki (workspace-wide knowledge base)

**Expected (Pro+, [pricing](https://plane.so/pricing?mode=self-hosted)):** Company-wide wiki without tying pages to a project; collections, navigation pane, `/wiki/{pageId}` URLs, app switcher between Projects and Wiki.

**Current codebase:**

| Layer                     | Status                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes                    | 🚫 No `app/.../wiki/` route group (only assets under `app/assets/empty-state/wiki/`)                                                            |
| Navigation                | 🚫 `WorkspaceAppSwitcher` returns empty fragment (ce **and** extended)                                                                          |
| Data model                | ⚠️ `Page.is_global` on `apps/api/plane/db/models/page.py`—intended for wiki-style pages but **not** exposed in `apps/api/plane/app/views/page/` |
| Search/navigation helpers | ⚠️ References `/{workspaceSlug}/wiki/{id}` in command palette—**dead links** without routes                                                     |
| i18n                      | ✅ Full `wiki.json`, `wiki_collections.*` keys—**no UI**                                                                                        |
| Real-time editing         | 🚫 Collaboration cursor disabled in editor flagging                                                                                             |

**Verdict:** **Missing** as a product feature. Project **Pages** are available; **Workspace Wiki** is not.

---

### 2. GitHub integration (issue & PR sync)

**Expected ([docs](https://docs.plane.so/integrations/github)):** GitHub App install, org connect, per-project repo sync, bidirectional issue sync, PR state automation, personal account linking.

**Current codebase:**

| Layer                   | Status                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| DB                      | ✅ `github_repositories`, `github_repository_syncs`, `github_issue_syncs`, `github_comment_syncs`                                             |
| Instance config         | ✅ `GITHUB_CLIENT_ID`, `ENABLE_GITHUB_SYNC` in `instance_config_variables/core.py`                                                            |
| Web UI                  | ⚠️ Workspace Integrations page, GitHub card, repository picker                                                                                |
| REST API                | 🚫 **No** routes for `/api/integrations/`, `/api/workspaces/.../workspace-integrations/.../github-repositories` in `apps/api/plane/app/urls/` |
| Webhooks / sync workers | 🚫 Not found in OSS tree                                                                                                                      |
| GitHub OAuth            | ✅ User authentication only                                                                                                                   |

**Verdict:** **Shell only**—schema and frontend expect a **commercial API module**. Self-hosted requires [GitHub App setup](https://docs.plane.so/integrations/github) per docs; implementation is not in this repository.

---

### 3. Sentry integration (error → work item)

**Expected ([docs](https://docs.plane.so/integrations/sentry)):** Connect Sentry org, state mapping, alert rules creating Plane work items, bi-directional resolve/unresolve, “Makeplane” issue linking.

**Current codebase:**

| Layer              | Status                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Python/TS app code | 🚫 No models, views, webhooks, or services under `apps/`                                 |
| i18n               | ✅ Complete `sentry_integration` copy in `packages/i18n/src/locales/en/integration.json` |
| Docs note          | Commercial self-hosted setup guide referenced on docs site                               |

**Verdict:** **Fully missing** in OSS; only localization placeholders.

---

### 4. Auto-transfer cycle work items

**Expected (Pro+):** When cycle auto-creation is enabled, incomplete work items roll into the next cycle automatically.

**Current codebase:**

| Layer          | Status                                                              |
| -------------- | ------------------------------------------------------------------- |
| Schema         | ✅ `Project.auto_transfer_cycle_issues` (migration `0125`)          |
| API validation | ✅ Requires `auto_create_cycles`                                    |
| Background job | ✅ `plane.bgtasks.cycle_automation_task`                            |
| Transfer logic | ✅ `plane.utils.cycle_transfer_issues`                              |
| UI             | ✅ `AutoTransferCycleIssues` on project automations settings        |
| Tests          | ✅ `e2e/tests/cycle-automation.spec.ts`, `test_cycle_automation.py` |

**Verdict:** **Fully implemented** in this repository. Pricing marks it unavailable on Free tier; enabling on a self-hosted instance is a **license/product** decision, not a code gap.

**Note:** User screenshot showing “—” on Free is **correct commercially**; this fork already contains the feature in code.

---

### 5. Export (work items & projects, universal format)

**Expected (Pro “Advanced exports”):** Export filtered work items from projects in CSV, Excel, JSON; ideally full workspace/project portability.

**Current codebase:**

| Capability              | Status | Location                                                                           |
| ----------------------- | ------ | ---------------------------------------------------------------------------------- |
| Work item export API    | ✅     | `POST/GET .../export-issues/` → `ExportIssuesEndpoint`, Celery `issue_export_task` |
| Formats                 | ✅     | `csv`, `xlsx`, `json` via `EXPORTERS_LIST`                                         |
| Serializer              | ✅     | `IssueExportSerializer` (human-readable columns, comments, relations)              |
| Delivery                | ✅     | ZIP to S3/MinIO, presigned URL, `ExporterHistory`                                  |
| UI                      | ✅     | `settings/(workspace)/exports/page.tsx`, `ExportGuide`, `ExportForm`               |
| Page export             | ⚠️     | Client PDF/markdown (`export-page-modal.tsx`)                                      |
| Project metadata export | 🚫     | No dedicated “all projects” JSON archive                                           |
| View-filtered export    | 🚫     | Filter UI commented out in `export-form.tsx`                                       |
| Importers symmetry      | ⚠️     | Import APIs referenced by frontend but **not** wired in OSS `app/urls`             |

**Universal format recommendation:** **JSON** (lossless-ish) + **CSV** (interop). Current JSON export is work-item-centric per selected projects, not full workspace schema.

**Verdict:** **Partial**—strong work item export; gaps for full workspace/project bundle and filtered “advanced” export UX.

---

## Additional notable gaps (Pro/Business)

- **Time tracking:** Backend ready; ensure `extended` build and no license block. Approvals (Business) not in OSS.
- **Integrations marketplace:** UI lists providers from `GET /api/integrations/`—endpoint **missing** in OSS API.
- **Epics, initiatives, dashboards (advanced), workflows:** Stubs or absent.
- **Live collaboration:** `apps/live` package exists; editor explicitly disables collaboration in OSS web build.
- **Draw.io embeds, Slack sync:** Not implemented in OSS.

---

## Configuration snapshot (this repo)

```json
// apps/web/tsconfig.json
"@/plane-web/*": ["./extended/*"]
```

To build strict Community Edition stubs, repoint alias to `./ce/*` per `docs/ARCHITECTURE.md`.

---

## Sources

- [Plane self-hosted pricing](https://plane.so/pricing?mode=self-hosted)
- [GitHub integration docs](https://docs.plane.so/integrations/github)
- [Sentry integration docs](https://docs.plane.so/integrations/sentry)
- In-repo: `docs/ARCHITECTURE.md`, `apps/web/core/constants/plans.tsx`, `packages/constants/src/subscription.ts`
- User screenshots (Free tier feature table, May 2026)

---

## Summary table (priority features)

| Feature              | In OSS repo?     | Matches Pro/Business?                    | Gap severity                           |
| -------------------- | ---------------- | ---------------------------------------- | -------------------------------------- |
| Wiki                 | No               | No                                       | **High**                               |
| GitHub sync          | Partial (no API) | No                                       | **High**                               |
| Sentry               | No               | No                                       | **High**                               |
| Auto-transfer cycles | Yes              | Yes (code); Free tier gated commercially | **Low** (for implementers)             |
| Work item export     | Yes              | Mostly                                   | **Medium** (workspace bundle, filters) |
