# Plane — Architecture Overview

> **Last updated:** 2025-07-15  
> **Source revision:** Based on `main` branch analysis + [DeepWiki](https://deepwiki.com/makeplane/plane), [Plane Docs](https://docs.plane.so/), and [Developer Docs](https://docs.plane.so/self-hosting/plane-architecture)

---

## Table of Contents

- [1. What is Plane?](#1-what-is-plane)
- [2. Repository Layout](#2-repository-layout)
- [3. Frontend Applications](#3-frontend-applications)
- [4. Backend Services](#4-backend-services)
- [5. Shared Packages](#5-shared-packages)
- [6. Technology Stack](#6-technology-stack)
- [7. Data Flow & Architecture](#7-data-flow--architecture)
- [8. Build System & Tooling](#8-build-system--tooling)
- [9. Edition Structure](#9-edition-structure)
- [10. Community Edition (CE) Stub Architecture](#10-community-edition-ce-stub-architecture)
- [11. Deployment Options](#11-deployment-options)
- [12. Key Configuration Files](#12-key-configuration-files)

---

## 1. What is Plane?

Plane is an open-source project management platform for tracking issues, managing cycles (sprints), organising modules, and building product roadmaps. It is licensed under **AGPL-3.0** and maintained as a **pnpm monorepo** containing frontend applications, a Django backend, a real-time collaboration server, and shared TypeScript packages.

| Property            | Value                    |
| ------------------- | ------------------------ |
| Version             | 1.2.0                    |
| License             | AGPL-3.0                 |
| Package Manager     | pnpm 10.24.0             |
| Build Orchestrator  | Turborepo 2.6.3          |
| Node.js Requirement | ≥ 22.18.0                |
| Python Requirement  | 3.8+ (recommended 3.11+) |

---

## 2. Repository Layout

```
plane/
├── apps/
│   ├── web/            # Main project management UI (port 3000)
│   ├── admin/          # Instance admin panel — "God Mode" (port 3001)
│   ├── space/          # Public-facing project views & embeds (port 3002)
│   ├── live/           # Real-time collaboration WebSocket server
│   ├── api/            # Django REST API + Celery workers
│   └── proxy/          # Nginx reverse proxy (Docker only)
├── packages/
│   ├── constants/      # Shared constants, enums, payment config
│   ├── decorators/     # TypeScript decorators (reflect-metadata)
│   ├── editor/         # Rich text editor (Tiptap + ProseMirror + Yjs)
│   ├── eslint-config/  # Shared ESLint configurations
│   ├── hooks/          # Reusable React hooks
│   ├── i18n/           # Internationalization (intl-messageformat)
│   ├── logger/         # Winston-based structured logging
│   ├── propel/         # Base design system (accordion, button, dialog…)
│   ├── services/       # Axios-based typed API client wrappers
│   ├── shared-state/   # MobX stores shared across apps
│   ├── tailwind-config/# Shared Tailwind CSS v4 config
│   ├── types/          # Shared TypeScript type definitions
│   ├── typescript-config/ # Shared tsconfig bases
│   ├── ui/             # Extended UI component library
│   └── utils/          # Pure utility functions
├── deployments/        # Docker / Kubernetes / AIO deployment configs
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

The `pnpm-workspace.yaml` includes `apps/*` and `packages/*` but **excludes** `apps/api` (the Django backend lives outside the JS workspace).

---

## 3. Frontend Applications

### 3.1 Web (`apps/web`) — Port 3000

The primary user-facing application. Built with **React 18 + React Router 7** (migrated from Next.js) and **MobX** for state management.

**Key directories:**

| Path       | Purpose                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `app/`     | React Router route definitions and page components                        |
| `core/`    | Core business logic — stores, components, services (edition-agnostic)     |
| `ce/`      | **Community Edition stubs** — feature placeholders for paid-tier features |
| `helpers/` | Shared helper functions                                                   |
| `styles/`  | Global CSS / Tailwind entry points                                        |

The `tsconfig.json` defines two critical path aliases:

- `@/*` → `./core/*` (core application code)
- `@/plane-web/*` → `./ce/*` (edition-specific code; swapped for commercial editions)

### 3.2 Admin (`apps/admin`) — Port 3001

Instance administration panel ("God Mode"). Also React 18 + React Router 7 + MobX.

Manages:

- Instance registration and setup wizard
- Authentication provider configuration (Google, GitHub, GitLab, Gitea OAuth, SMTP)
- Instance configuration (telemetry, signup, file size limits)
- Admin user management

### 3.3 Space (`apps/space`) — Port 3002

Public-facing read-only views for shared projects, embedded pages, and public issue tracking.

### 3.4 Live (`apps/live`) — WebSocket

Real-time collaboration server built on **Hocuspocus** (WebSocket server for Yjs CRDTs).

| Component                        | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `@hocuspocus/server`             | WebSocket server coordinating edits          |
| `@hocuspocus/extension-database` | Persists Yjs documents to PostgreSQL         |
| `@hocuspocus/extension-redis`    | Syncs across multiple server instances       |
| `@hocuspocus/transformer`        | Converts between Yjs binary ↔ HTML           |
| `yjs`                            | CRDT engine for conflict-free merging        |
| `y-prosemirror`                  | Binds Yjs to ProseMirror editor state        |
| `y-indexeddb`                    | Browser-side persistence for offline support |

---

## 4. Backend Services

### 4.1 Django API (`apps/api`)

A Django 4.x REST API served by **Gunicorn** in production.

**Key Django apps:**

| App                    | Path                    | Purpose                                        |
| ---------------------- | ----------------------- | ---------------------------------------------- |
| `plane.app`            | `plane/app/`            | Core API views, serializers, permissions       |
| `plane.db`             | `plane/db/`             | Data models (User, Workspace, Project, Issue…) |
| `plane.license`        | `plane/license/`        | Instance registration, configuration, admin    |
| `plane.authentication` | `plane/authentication/` | Auth flows (session, OAuth, magic link)        |
| `plane.api`            | `plane/api/`            | Public API v1 endpoints                        |
| `plane.space`          | `plane/space/`          | Public space API                               |
| `plane.web`            | `plane/web/`            | Frontend-serving URLs                          |
| `plane.analytics`      | `plane/analytics/`      | Analytics/reporting                            |
| `plane.bgtasks`        | `plane/bgtasks/`        | Celery task definitions                        |
| `plane.middleware`     | `plane/middleware/`     | Request logging, body size limits, DB routing  |
| `plane.utils`          | `plane/utils/`          | Shared Python utilities                        |
| `plane.seeds`          | `plane/seeds/`          | Database seed data                             |

### 4.2 Celery Workers

Two worker processes share the `plane-backend` Docker image:

- **`bgworker`** — Processes async tasks: email sending, webhook delivery, analytics, bulk operations, file cleanup, issue version sync
- **`beatworker`** — Scheduled periodic tasks: notifications, cleanup jobs, telemetry reporting (`instance_traces`)

### 4.3 Database Migrator

A one-shot container (`plane-migrator`) that runs Django migrations and the `register_instance` / `configure_instance` management commands at startup.

---

## 5. Shared Packages

### Foundation Layer

| Package            | Purpose                                               |
| ------------------ | ----------------------------------------------------- |
| `@plane/types`     | All TypeScript interfaces and type definitions        |
| `@plane/constants` | Enums, routes, colours, feature lists, payment config |
| `@plane/utils`     | Pure functions: date formatting, validation, URLs     |
| `@plane/hooks`     | React hooks: `useOutsideClick`, `useDebounce`, etc.   |

### UI Layer

| Package         | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `@plane/propel` | Base design system — 30+ primitives on `@base-ui-components/react` |
| `@plane/ui`     | Extended widgets, issue-specific components                        |
| `@plane/editor` | Rich text editor (Tiptap 2.26 + collaborative Yjs)                 |

### Data Layer

| Package               | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `@plane/services`     | Typed Axios wrappers for every API endpoint           |
| `@plane/shared-state` | MobX stores: issues, projects, cycles, modules, users |

### Infrastructure Layer

| Package                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `@plane/i18n`              | Internationalization (14 languages)          |
| `@plane/logger`            | Winston logger + Express middleware          |
| `@plane/decorators`        | TypeScript decorators via `reflect-metadata` |
| `@plane/tailwind-config`   | Shared Tailwind CSS v4 configuration         |
| `@plane/typescript-config` | Shared `tsconfig` bases                      |
| `@plane/eslint-config`     | Shared ESLint rule presets                   |

All packages use `tsdown` for fast TypeScript → ESM compilation and are referenced via `workspace:*` in consuming apps.

---

## 6. Technology Stack

### Frontend

| Technology   | Version | Purpose                           |
| ------------ | ------- | --------------------------------- |
| React        | 18.3.1  | UI framework                      |
| React Router | 7.12.0  | Client-side routing (was Next.js) |
| MobX         | 6.12.0  | Reactive state management         |
| SWR          | 2.2.4   | Data fetching & caching           |
| Axios        | 1.12.0  | HTTP client                       |
| Tiptap       | 2.26.3  | Rich text editor framework        |
| Tailwind CSS | 4.1.17  | Utility-first styling             |
| TypeScript   | 5.8.3   | Type safety                       |
| Vite         | 7.1.11  | Build tool & dev server           |
| tsdown       | 0.16.0  | Package compilation               |
| Turborepo    | 2.6.3   | Build orchestration & caching     |
| lucide-react | 0.469.0 | Icons                             |

### Backend

| Technology     | Version | Purpose                         |
| -------------- | ------- | ------------------------------- |
| Django         | 4.x     | REST API framework              |
| PostgreSQL     | 15.7    | Primary database                |
| Valkey (Redis) | 7.2.11  | Caching, sessions, pub/sub      |
| RabbitMQ       | 3.13.6  | Message queue (Celery broker)   |
| MinIO          | Latest  | S3-compatible object storage    |
| Celery         | Latest  | Async task processing           |
| Gunicorn       | Latest  | WSGI HTTP server                |
| Nginx          | Latest  | Reverse proxy + SSL termination |

---

## 7. Data Flow & Architecture

```
                    ┌─────────────────────────────┐
                    │        Nginx Proxy           │
                    │   (ports 80/443 exposed)     │
                    └─────────┬───────────────────┘
                              │ Routes by path prefix
           ┌──────────────────┼──────────────────────┐
           │                  │                       │
    /god-mode/         /api/*  /auth/*          /spaces/*
    ┌──────┐        ┌──────────────┐           ┌──────┐
    │admin │        │  Django API  │           │space │
    │:3001 │        │    :8000     │           │:3002 │
    └──────┘        └──────┬───────┘           └──────┘
                           │
       / (default)         │            /live/*
    ┌──────┐        ┌──────┴───────┐   ┌──────────────┐
    │ web  │        │  PostgreSQL  │   │  Live (Yjs)  │
    │:3000 │        │  :5432       │   │  WebSocket   │
    └──────┘        ├──────────────┤   └──────────────┘
                    │  Valkey      │
                    │  :6379       │
                    ├──────────────┤
                    │  RabbitMQ    │──→ Celery Workers
                    │  :5672       │     (bg + beat)
                    ├──────────────┤
                    │  MinIO       │
                    │  :9000       │
                    └──────────────┘
```

### Request Flow

1. **Nginx** receives all incoming requests and routes them based on URL path prefix
2. **Frontend apps** (web, admin, space) are served as static builds or dev servers
3. **API requests** (`/api/*`, `/auth/*`) are proxied to the Django API
4. **WebSocket connections** (`/live/*`) are proxied to the Hocuspocus server
5. **Background tasks** are enqueued via RabbitMQ and processed by Celery workers
6. **File uploads** go through the API and are stored in MinIO (S3-compatible)

### State Management Flow (Frontend)

1. **MobX stores** (`@plane/shared-state` + app-specific stores) hold reactive state
2. **Services** (`@plane/services`) make API calls via Axios
3. **SWR** handles data fetching, caching, and revalidation
4. **Components** observe MobX stores and re-render reactively

---

## 8. Build System & Tooling

### Turborepo Pipeline (`turbo.json`)

| Command            | Description                                 | Cached |
| ------------------ | ------------------------------------------- | ------ |
| `pnpm dev`         | Run all apps in development (18 concurrent) | No     |
| `pnpm build`       | Production build (all apps + packages)      | Yes    |
| `pnpm start`       | Start production builds                     | No     |
| `pnpm check`       | Run lint + types + format checks            | No     |
| `pnpm check:lint`  | ESLint across all workspaces                | No     |
| `pnpm check:types` | TypeScript type checking                    | No     |
| `pnpm fix`         | Auto-fix lint + formatting                  | No     |
| `pnpm clean`       | Remove `dist/`, `node_modules/`, `.turbo/`  | N/A    |

### Package Build

All shared packages compile with `tsdown` (a fast TypeScript bundler). Each package defines:

- `dev` → `tsdown --watch` (development with hot-reload)
- `build` → `tsdown` (production)
- `clean` → removes `dist/`, `node_modules/`, `.turbo/`

### Global Dependencies Tracked by Turbo

- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `.npmrc`

---

## 9. Edition Structure

Plane ships in **four editions**, each with distinct feature sets:

### 9.1 Editions Overview

| Edition        | License     | Source | Feature Set                     | Upgrade Path                    |
| -------------- | ----------- | ------ | ------------------------------- | ------------------------------- |
| **Community**  | AGPL-3.0    | Open   | Equivalent to Cloud Free tier   | Must switch to Commercial first |
| **Commercial** | Proprietary | Closed | Full Cloud parity + paid plans  | In-app upgrade via license keys |
| **Airgapped**  | Proprietary | Closed | Same as Commercial, no internet | Offline license activation      |
| **Cloud**      | N/A (SaaS)  | Hosted | All features                    | In-app billing                  |

### 9.2 Subscription Tiers

Defined in `packages/types/src/payment.ts` and `packages/constants/src/payment.ts`:

| Tier           | Enum Value                            | Pricing (per user/mo) | Key Features                                                          |
| -------------- | ------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| **Free**       | `EProductSubscriptionEnum.FREE`       | $0                    | Core PM: issues, cycles, modules, pages, views                        |
| **One**        | `EProductSubscriptionEnum.ONE`        | (Legacy/special tier) | OIDC + SAML SSO, Active Cycles, real-time collab, basic time tracking |
| **Pro**        | `EProductSubscriptionEnum.PRO`        | $8/mo or $72/yr       | Dashboards, full time tracking, Teamspaces, automation, Wikis         |
| **Business**   | `EProductSubscriptionEnum.BUSINESS`   | $15/mo or $156/yr     | Project templates, workflows, approvals, custom reports, nested pages |
| **Enterprise** | `EProductSubscriptionEnum.ENTERPRISE` | Contact sales         | Private deployments, GAC, LDAP, databases, full automation            |

### 9.3 Feature Lists by Tier

From `packages/constants/src/subscription.ts`:

**Pro Plan:**

- Dashboards + Reports
- Full Time Tracking + Bulk Ops
- Teamspaces
- Trigger And Action automation
- Wikis
- Popular integrations

**Business Plan:**

- Project Templates
- Workflows + Approvals
- Decision + Loops Automation
- Custom Reports
- Nested Pages
- Intake Forms

**Enterprise Plan:**

- Private + managed deployments
- GAC (Granular Access Control)
- LDAP support
- Databases + Formulas
- Unlimited and full Automation Flows
- Full-suite professional services

---

## 10. Community Edition (CE) Stub Architecture

This is the most architecturally significant pattern for understanding feature gating.

### How It Works

The **Community Edition** uses a **compile-time module substitution** pattern:

1. The `apps/web/core/` directory contains **all core application code** that is edition-agnostic
2. The `apps/web/ce/` directory contains **stub implementations** for paid-tier features
3. The `tsconfig.json` alias `@/plane-web/*` resolves to `./ce/*`
4. In **Commercial/Enterprise editions**, this alias is repointed to a different directory containing real implementations

```
tsconfig.json:
  "@/plane-web/*" → "./ce/*"     ← Community Edition (stubs)
  "@/*"           → "./core/*"   ← Core code (all editions)
```

### What Gets Stubbed

The `ce/` directory contains **118+ stub files** across these categories:

#### Components (empty renders / no-op)

| Stub Path                                                         | Feature                        |
| ----------------------------------------------------------------- | ------------------------------ |
| `ce/components/issues/worklog/property/root.tsx`                  | Time tracking property display |
| `ce/components/issues/worklog/activity/root.tsx`                  | Time tracking activity log     |
| `ce/components/issues/worklog/activity/worklog-create-button.tsx` | Worklog creation button        |
| `ce/components/issues/bulk-operations/`                           | Bulk issue operations          |
| `ce/components/workflow/`                                         | Workflows & approvals          |
| `ce/components/gantt-chart/dependency/`                           | Gantt dependency lines         |
| `ce/components/epics/`                                            | Epic management                |
| `ce/components/cycles/active-cycle/`                              | Active cycle features          |
| `ce/components/pages/editor/ai/`                                  | AI-powered editor features     |
| `ce/components/workspace/billing/`                                | Billing & subscription UI      |
| `ce/components/license/modal/upgrade-modal.tsx`                   | Paid plan upgrade modal        |
| `ce/components/de-dupe/`                                          | Issue deduplication            |
| `ce/components/views/publish/`                                    | Public view publishing         |

#### Hooks (return `false` / empty config)

| Stub Path                               | What It Returns                                             |
| --------------------------------------- | ----------------------------------------------------------- |
| `ce/hooks/use-bulk-operation-status.ts` | `false` (disabled)                                          |
| `ce/hooks/use-page-flag.ts`             | `{ isMovePageEnabled: false, isPageSharingEnabled: false }` |
| `ce/hooks/use-editor-flagging.ts`       | Disables `ai` and `collaboration-cursor` extensions         |
| `ce/hooks/use-issue-properties.tsx`     | No-op (returns `undefined`)                                 |
| `ce/hooks/use-timeline-chart.ts`        | Empty timeline config                                       |

#### Stores (minimal / pass-through)

| Stub Path                           | Purpose                                        |
| ----------------------------------- | ---------------------------------------------- |
| `ce/store/root.store.ts`            | Extends `CoreRootStore` with minimal additions |
| `ce/store/issue/epic/`              | Empty epic stores                              |
| `ce/store/issue/team/`              | Empty team issue stores                        |
| `ce/store/workspace/`               | Minimal workspace store                        |
| `ce/store/user/permission.store.ts` | Basic permission store                         |

### Example: Time Tracking Stubs

Time tracking is a **Pro plan** feature. In the CE, these components render nothing:

```typescript
// ce/components/issues/worklog/property/root.tsx
export function IssueWorklogProperty(_props: TIssueWorklogProperty) {
  return <></>;  // Empty fragment — feature hidden
}

// ce/components/issues/worklog/activity/root.tsx
export function IssueActivityWorklog(_props: TIssueActivityWorklog) {
  return <></>;  // Empty fragment — feature hidden
}

// ce/components/issues/worklog/activity/worklog-create-button.tsx
export function IssueActivityWorklogCreateButton(_props) {
  return <></>;  // Empty fragment — no create button
}
```

In the **Commercial edition**, the same import paths (`@/plane-web/components/issues/worklog/...`) resolve to full implementations with UI, API calls, and state management.

---

## 11. Deployment Options

| Method             | Use Case                 | Containers     | Scaling        |
| ------------------ | ------------------------ | -------------- | -------------- |
| **Plane Cloud**    | Quick start / SaaS       | N/A (managed)  | Automatic      |
| **Docker Compose** | Single-server production | 13 containers  | Manual         |
| **Docker AIO**     | Evaluation / demos       | 1 container    | None           |
| **Docker Swarm**   | Multi-node               | Swarm services | Swarm scaling  |
| **Kubernetes**     | Enterprise / HA          | Helm chart     | HPA / replicas |

### Docker Compose Services

| Container        | Image             | Port   | Purpose                           |
| ---------------- | ----------------- | ------ | --------------------------------- |
| `web`            | `plane-frontend`  | —      | Main web application              |
| `admin`          | `plane-admin`     | —      | Admin panel                       |
| `space`          | `plane-space`     | —      | Public space views                |
| `api`            | `plane-backend`   | 8000   | Django REST API                   |
| `bgworker`       | `plane-backend`   | —      | Celery async worker               |
| `beatworker`     | `plane-backend`   | —      | Celery beat scheduler             |
| `plane-migrator` | `plane-backend`   | —      | DB migrations (runs once)         |
| `plane-live`     | `plane-live`      | —      | Real-time collaboration           |
| `plane-db`       | `postgres:15.7`   | 5432   | PostgreSQL (max_connections=1000) |
| `plane-redis`    | `valkey:7.2.11`   | 6379   | Cache / sessions / pub-sub        |
| `plane-mq`       | `rabbitmq:3.13.6` | 5672   | Message queue for Celery          |
| `plane-minio`    | `minio/minio`     | 9000   | Object storage (S3-compatible)    |
| `proxy`          | `plane-proxy`     | 80/443 | Nginx reverse proxy               |

---

## 12. Key Configuration Files

| File                                                              | Purpose                                             |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| `package.json`                                                    | Root monorepo config, scripts, version              |
| `pnpm-workspace.yaml`                                             | Workspace package declarations + dependency catalog |
| `turbo.json`                                                      | Turborepo pipeline definitions                      |
| `.env.example`                                                    | Root environment variable template                  |
| `apps/api/plane/settings/common.py`                               | Django settings: DB, cache, celery, storage         |
| `apps/web/tsconfig.json`                                          | Web app TypeScript config (includes CE alias)       |
| `apps/web/vite.config.ts`                                         | Vite build config for web app                       |
| `docker-compose.yml`                                              | Production Docker Compose                           |
| `docker-compose-local.yml`                                        | Local development Docker Compose                    |
| `setup.sh`                                                        | Development environment bootstrap script            |
| `apps/api/plane/license/models/instance.py`                       | Instance + configuration models                     |
| `apps/api/plane/license/management/commands/register_instance.py` | Instance registration command                       |
