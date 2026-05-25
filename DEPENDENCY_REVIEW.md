# Dependency Review — Plane Monorepo

> Generated: 2026-05-25 | Monorepo version: 1.3.1 | Package manager: pnpm 10.33.0

---

## Section 1: Folder Structure

### Apps

| App          | Description                                                                       | Tech Stack                                                                                                           |
| ------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/admin` | Administration control-plane UI — manages users, billing, and site-level settings | React Router 7 (SPA, served by `serve`), MobX, TailwindCSS v4, Vite                                                  |
| `apps/api`   | Core REST API backend _(excluded from JS workspace)_                              | Python / Django                                                                                                      |
| `apps/live`  | Real-time collaboration server — powers the multiplayer rich-text editor          | Node.js (ESM), Hocuspocus (Yjs WebSocket), Express, Redis (ioredis), Effect, `@react-pdf` for server-side PDF export |
| `apps/proxy` | Reverse-proxy layer _(excluded from JS workspace)_                                | Likely nginx/Caddy config                                                                                            |
| `apps/space` | Public-facing project portal — external stakeholders view/comment on issues       | React Router 7 (SSR via `@react-router/serve`), MobX, TailwindCSS v4, Vite                                           |
| `apps/web`   | Primary Plane web application — full project management UI                        | React Router 7 (SPA, served by `serve`), MobX, TailwindCSS v4, Vite, Atlaskit DnD, TipTap editor, PDF export         |

### Packages

| Package                    | Description                                                                                                                                   | Tech Stack                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@plane/codemods`          | AST-based codebase migration scripts                                                                                                          | jscodeshift, Vitest                                                                                   |
| `@plane/constants`         | Shared enums, configuration constants, and lookup tables                                                                                      | TypeScript ESM, tsdown                                                                                |
| `@plane/decorators`        | TypeScript decorators for Express.js controllers and route registration                                                                       | TypeScript, reflect-metadata; used exclusively by `apps/live`                                         |
| `@plane/editor`            | TipTap-based rich-text editor — core editing with collaborative (Yjs/Hocuspocus) support, Markdown, code highlighting, mentions, file uploads | TipTap 2.x, Yjs, ProseMirror, `@floating-ui`, linkifyjs, highlight.js                                 |
| `@plane/hooks`             | Shared React custom hooks (minimal surface area, no deps outside React)                                                                       | React, TypeScript                                                                                     |
| `@plane/i18n`              | Internationalization wiring — i18next with ICU message format                                                                                 | i18next, i18next-icu, react-i18next                                                                   |
| `@plane/logger`            | Winston-based structured logging for Express apps                                                                                             | winston, express-winston                                                                              |
| `@plane/propel`            | Newer design system / component library — charts, data grids, pickers, dialogs                                                                | Base UI (beta), Recharts, Framer Motion, cmdk, react-day-picker, TanStack Table; Vite-based Storybook |
| `@plane/services`          | Typed axios API client classes for Plane's REST API                                                                                           | axios, file-type                                                                                      |
| `@plane/shared-state`      | MobX stores and reactive state shared across web apps                                                                                         | MobX, mobx-utils, lodash-es, Zod                                                                      |
| `@plane/tailwind-config`   | Shared Tailwind CSS v4 config and PostCSS setup                                                                                               | TailwindCSS 4.2.2, PostCSS 8.5.8 (overridden to 8.5.10 by root)                                       |
| `@plane/types`             | Shared TypeScript type definitions and interfaces (no runtime deps)                                                                           | TypeScript, tsdown                                                                                    |
| `@plane/typescript-config` | Shared `tsconfig.json` presets (base, react-library, nextjs, node-library)                                                                    | TypeScript                                                                                            |
| `@plane/ui`                | Legacy UI component library — forms, dialogs, DnD, tables, date pickers                                                                       | BlueprintJS 6, Headless UI v1, Atlaskit DnD, Radix, react-popper; webpack-based Storybook             |
| `@plane/utils`             | Shared utility functions — HTML→Markdown conversion, HTML sanitization, date helpers, color utilities                                         | sanitize-html, unified/rehype/remark pipeline, date-fns, chroma-js                                    |

---

## Section 2: Workspace Catalog

The `pnpm-workspace.yaml` catalog pins the following shared versions. All `catalog:` references in package.json files resolve to these exact versions.

| Catalog Entry                                   | Pinned Version | Notes                         |
| ----------------------------------------------- | -------------- | ----------------------------- |
| `@atlaskit/pragmatic-drag-and-drop`             | `1.7.10`       | **Outdated** → 1.8.1 (minor)  |
| `@atlaskit/pragmatic-drag-and-drop-auto-scroll` | `2.1.5`        | Current                       |
| `@atlaskit/pragmatic-drag-and-drop-hitbox`      | `1.1.0`        | Current                       |
| `@bprogress/core`                               | `^1.3.4`       | Current                       |
| `@react-router/dev`                             | `7.14.0`       | **Outdated** → 7.15.1 (minor) |
| `@react-router/node`                            | `7.14.0`       | **Outdated** → 7.15.1 (minor) |
| `@react-router/serve`                           | `7.14.0`       | **Outdated** → 7.15.1 (minor) |
| `@tailwindcss/postcss`                          | `4.2.2`        | Current                       |
| `@tiptap/core`                                  | `^2.27.2`      | Current                       |
| `@tiptap/html`                                  | `^2.27.2`      | Current                       |
| `@types/lodash-es`                              | `4.17.12`      | Current                       |
| `@types/node`                                   | `22.15.34`     | Current                       |
| `@types/react`                                  | `18.3.23`      | Current                       |
| `@types/react-dom`                              | `18.3.7`       | Current                       |
| `axios`                                         | `1.13.6`       | Current                       |
| `dotenv`                                        | `17.3.1`       | Current                       |
| `express`                                       | `4.22.0`       | Current                       |
| `i18next`                                       | `25.10.9`      | Current                       |
| `i18next-icu`                                   | `2.4.3`        | Current                       |
| `i18next-resources-to-backend`                  | `1.2.1`        | Current                       |
| `lodash-es`                                     | `4.17.23`      | Current                       |
| `lucide-react`                                  | `0.577.0`      | Current                       |
| `mobx`                                          | `6.15.0`       | **Outdated** → 6.15.4 (patch) |
| `mobx-react`                                    | `9.2.1`        | Current                       |
| `mobx-utils`                                    | `6.1.1`        | Current                       |
| `react`                                         | `18.3.1`       | Current                       |
| `react-dom`                                     | `18.3.1`       | Current                       |
| `react-i18next`                                 | `16.6.6`       | Current                       |
| `react-router`                                  | `7.14.0`       | **Outdated** → 7.15.1 (minor) |
| `swr`                                           | `2.4.1`        | Current                       |
| `tsdown`                                        | `0.21.7`       | Current                       |
| `tsx`                                           | `4.20.6`       | Current                       |
| `typescript`                                    | `5.8.3`        | Current                       |
| `uuid`                                          | `13.0.0`       | Current                       |
| `vite`                                          | `8.0.3`        | **Outdated** → 8.0.14 (patch) |

### Root `pnpm.overrides` (forced versions across all packages)

Notable overrides that affect transitive dependencies:

| Override                | Forced Version | Rationale                                                                            |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `postcss`               | `8.5.10`       | Consistency — supersedes `tailwind-config`'s own `8.5.8`; **both outdated** → 8.5.15 |
| `vite`                  | `catalog:`     | Unified Vite version                                                                 |
| `typescript`            | `catalog:`     | Unified TypeScript version                                                           |
| `axios`                 | `catalog:`     | Security/consistency                                                                 |
| `uuid`                  | `catalog:`     | UUID v13 pinned globally                                                             |
| `lodash-es`             | `catalog:`     | ESM lodash unified                                                                   |
| `express`               | `catalog:`     | Unified Express version                                                              |
| Various `prosemirror-*` | pinned         | Editor stability                                                                     |

---

## Section 3: Per-Package Dependency Review

### `apps/admin`

> React Router 7 SPA served by `serve`. Admin UI for site management.

**Outdated dependencies:**

| Dependency                             | Current            | Latest    | Type  | Notes                             |
| -------------------------------------- | ------------------ | --------- | ----- | --------------------------------- |
| `@fontsource/material-symbols-rounded` | `5.2.37`           | `5.2.45`  | patch | Font asset update only            |
| `@react-router/node`                   | `7.14.0` (catalog) | `7.15.1`  | minor | See catalog; update catalog entry |
| `@react-router/dev`                    | `7.14.0` (catalog) | `7.15.1`  | minor | devDep; update catalog entry      |
| `@tanstack/react-virtual`              | `^3.13.19`         | `3.13.25` | patch | Virtualizer bug fixes             |
| `@tanstack/virtual-core`               | `^3.13.19`         | `3.13.25` | patch | Same family as above              |
| `isbot`                                | `^5.1.35`          | `5.1.40`  | patch | Bot detection signatures          |
| `mobx`                                 | `6.15.0` (catalog) | `6.15.4`  | patch | Update catalog entry              |
| `react-router`                         | `7.14.0` (catalog) | `7.15.1`  | minor | Update catalog entry              |
| `serve`                                | `14.2.5`           | `14.2.6`  | patch | Static file server bug fixes      |
| `vite`                                 | `8.0.3` (catalog)  | `8.0.14`  | patch | Update catalog entry              |

**Up-to-date / no action:** `@bprogress/core`, `@fontsource-variable/inter`, `@fontsource/ibm-plex-mono`, `@headlessui/react`, all `@plane/*` workspace packages, `axios`, `lodash-es`, `lucide-react`, `mobx-react`, `next-themes`, `react`, `react-dom`, `react-hook-form`, `swr`, `uuid`.

---

### `apps/live`

> Node.js real-time collaboration server. Hocuspocus/Yjs over WebSocket. Handles collaborative editing, PDF export, and Redis-backed persistence.

**Outdated dependencies:**

| Dependency            | Current    | Latest    | Type  | Notes                                           |
| --------------------- | ---------- | --------- | ----- | ----------------------------------------------- |
| `@react-pdf/renderer` | `^4.3.2`   | `4.5.1`   | minor | PDF layout engine; test output fidelity         |
| `@react-pdf/types`    | `^2.9.2`   | `2.11.1`  | minor | TypeScript types for above                      |
| `effect`              | `3.21.0`   | `3.21.2`  | patch | Effect-TS runtime patch fixes                   |
| `ioredis`             | `5.10.0`   | `5.10.1`  | patch | Redis client bug fixes                          |
| `yjs`                 | `^13.6.29` | `13.6.30` | patch | CRDT library; keep in sync with `@plane/editor` |

**Up-to-date / no action:** `@effect/platform`, `@effect/platform-node`, `@hocuspocus/*` (3.4.4 pinned), `@tiptap/core`, `@tiptap/html`, `axios`, `compression`, `cors`, `dotenv`, `express`, `express-ws`, `helmet`, `react`, `sharp`, `uuid`, `ws`, `y-prosemirror`, `y-protocols`, `zod`.

**Notes:**

- `@hocuspocus/*` packages are all pinned at `3.4.4` (no range prefix). Check for security advisories; pinning all four at the same version is intentional for API consistency.
- `@effect/platform` (`^0.94.5`) and `@effect/platform-node` (`^0.104.1`) are notably ahead-of-range relative to each other — confirm version compatibility in the Effect ecosystem.

---

### `apps/space`

> React Router 7 SSR app (public project portal). Uses `@react-router/serve` for server-side rendering.

**Outdated dependencies:**

| Dependency                             | Current            | Latest   | Type  | Notes                            |
| -------------------------------------- | ------------------ | -------- | ----- | -------------------------------- |
| `@fontsource/material-symbols-rounded` | `5.2.37`           | `5.2.45` | patch | Font asset only                  |
| `@react-router/node`                   | `7.14.0` (catalog) | `7.15.1` | minor | Update catalog                   |
| `@react-router/serve`                  | `7.14.0` (catalog) | `7.15.1` | minor | Update catalog; critical for SSR |
| `@react-router/dev`                    | `7.14.0` (catalog) | `7.15.1` | minor | devDep; update catalog           |
| `isbot`                                | `^5.1.35`          | `5.1.40` | patch | Bot detection                    |
| `mobx`                                 | `6.15.0` (catalog) | `6.15.4` | patch | Update catalog                   |
| `react-router`                         | `7.14.0` (catalog) | `7.15.1` | minor | Update catalog                   |
| `vite`                                 | `8.0.3` (catalog)  | `8.0.14` | patch | Update catalog                   |

**Up-to-date / no action:** `@bprogress/core`, `@fontsource-variable/inter`, `@fontsource/ibm-plex-mono`, `@headlessui/react`, all `@plane/*` workspace packages, `@popperjs/core`, `axios`, `clsx`, `date-fns`, `lodash-es`, `lucide-react`, `mobx-react`, `mobx-utils`, `next-themes`, `react`, `react-dom`, `react-dropzone`, `react-hook-form`, `react-popper`, `swr`, `uuid`.

---

### `apps/web`

> Primary Plane web application. Largest app in the monorepo with the most direct dependencies.

**Outdated dependencies:**

| Dependency                             | Current            | Latest   | Type  | Notes                       |
| -------------------------------------- | ------------------ | -------- | ----- | --------------------------- |
| `@atlaskit/pragmatic-drag-and-drop`    | `1.7.10` (catalog) | `1.8.1`  | minor | DnD library; update catalog |
| `@fontsource/material-symbols-rounded` | `5.2.37`           | `5.2.45` | patch | Font asset only             |
| `@react-pdf/renderer`                  | `^4.3.2`           | `4.5.1`  | minor | Client-side PDF generation  |
| `@react-router/node`                   | `7.14.0` (catalog) | `7.15.1` | minor | Update catalog              |
| `@react-router/dev`                    | `7.14.0` (catalog) | `7.15.1` | minor | devDep; update catalog      |
| `isbot`                                | `^5.1.35`          | `5.1.40` | patch | Bot detection               |
| `mobx`                                 | `6.15.0` (catalog) | `6.15.4` | patch | Update catalog              |
| `react-is`                             | `^19.2.4`          | `19.2.6` | patch | React utility; update       |
| `react-router`                         | `7.14.0` (catalog) | `7.15.1` | minor | Update catalog              |
| `serve`                                | `14.2.5`           | `14.2.6` | patch | Static server               |
| `vite`                                 | `8.0.3` (catalog)  | `8.0.14` | patch | Update catalog              |

**Up-to-date / no action:** `@atlaskit/pragmatic-drag-and-drop-auto-scroll`, `@atlaskit/pragmatic-drag-and-drop-hitbox`, `@bprogress/core`, `@fontsource-variable/inter`, `@fontsource/ibm-plex-mono`, `@headlessui/react`, all `@plane/*` workspace packages, `@popperjs/core`, `@tanstack/react-table`, `axios`, `clsx`, `cmdk`, `comlink`, `date-fns`, `emoji-picker-react`, `export-to-csv`, `lodash-es`, `lucide-react`, `mobx-react`, `mobx-utils`, `next-themes`, `react`, `react-color`, `react-dom`, `react-dropzone`, `react-fast-compare`, `react-hook-form`, `react-markdown`, `react-masonry-component`, `react-pdf-html`, `react-popper`, `recharts`, `swr`, `uuid`.

---

### `packages/codemods`

> Code transformation tooling. Only devDependencies, no runtime code.

**Outdated dependencies:** None identified in the provided outdated output.

| Dependency           | Current   | Notes                             |
| -------------------- | --------- | --------------------------------- |
| `jscodeshift`        | `^17.3.0` | Current                           |
| `@types/jscodeshift` | `^17.3.0` | Current                           |
| `ast-types`          | `0.14.2`  | Pinned; compatibility requirement |
| `vitest`             | `^4.0.18` | Current                           |

---

### `packages/constants`

> Shared constant values. No runtime dependencies beyond workspace packages.

**Outdated dependencies:** None — all dependencies are catalog or workspace references.

---

### `packages/decorators`

> Express.js controller/route decorators. No direct runtime dependencies (inlines types).

**Outdated dependencies:** None identified.

**Notes:** Uses `inlinedDependencies` for `@types/express` and `reflect-metadata` — these are bundled into the output rather than declared as peer deps. The `@types/express: 4.17.23` is pinned; the root overrides `@types/express` to this same version.

---

### `packages/editor`

> Core TipTap rich-text editor. Heavy dependency tree covering collaborative editing, markdown, and code highlighting.

**Outdated dependencies:**

| Dependency         | Current    | Latest    | Type  | Notes                                           |
| ------------------ | ---------- | --------- | ----- | ----------------------------------------------- |
| `@floating-ui/dom` | `^1.7.5`   | `1.7.6`   | patch | Floating tooltip/popover positioning            |
| `linkifyjs`        | `^4.3.2`   | `4.3.3`   | patch | Autolink detection in editor                    |
| `postcss` (devDep) | `^8.5.8`   | `8.5.15`  | patch | Build tool; overridden to 8.5.10 by root anyway |
| `yjs`              | `^13.6.29` | `13.6.30` | patch | CRDT; keep in sync with `apps/live`             |

**Up-to-date / no action:** All `@tiptap/*` extensions (^2.27.2), `@floating-ui/react`, `@headlessui/react`, `@hocuspocus/provider` (3.4.4 pinned), all workspace packages, `buffer`, `emoji-regex`, `highlight.js`, `is-emoji-supported`, `jsx-dom-cjs`, `lodash-es`, `lowlight`, `lucide-react`, `prosemirror-codemark`, `tippy.js`, `tiptap-markdown`, `uuid`, `y-indexeddb`, `y-prosemirror`, `y-protocols`.

**Notes:**

- `@hocuspocus/provider` is pinned to `3.4.4` (no caret/tilde). Matches the server-side `@hocuspocus/*` versions in `apps/live` — this pairing must stay in sync.
- All ProseMirror packages are version-pinned via root `pnpm.overrides` for stability.

---

### `packages/hooks`

> Minimal shared React hooks. Only depends on `react` (catalog).

**Outdated dependencies:** None — `react` is current at 18.3.1.

---

### `packages/i18n`

> i18next wiring with ICU message format. All dependencies are catalog references.

**Outdated dependencies:** None — all are catalog references (i18next 25.10.9, react-i18next 16.6.6, etc. all current).

---

### `packages/logger`

> Winston-based logging. No catalog references; uses caret ranges.

**Outdated dependencies:** None identified in the provided outdated output.

| Dependency        | Current   | Notes          |
| ----------------- | --------- | -------------- |
| `winston`         | `^3.19.0` | Current in 3.x |
| `express-winston` | `^4.2.0`  | Current        |

---

### `packages/propel`

> Newer design system / component library. Vite-based Storybook.

**Outdated dependencies:**

| Dependency              | Current   | Latest      | Type  | Notes                      |
| ----------------------- | --------- | ----------- | ----- | -------------------------- |
| `@storybook/addon-docs` | `10.2.13` | patch/minor | minor | Update with storybook core |
| `@storybook/react-vite` | `10.2.13` | patch/minor | minor | Update with storybook core |
| `storybook`             | `10.2.13` | patch/minor | minor | Core storybook             |

**Up-to-date / no action:** `@base-ui-components/react` (1.0.0-beta.3), `@tanstack/react-table`, `class-variance-authority`, `clsx`, `cmdk`, `framer-motion`, `frimousse`, `lucide-react`, `react`, `react-day-picker`, `react-dom`, `recharts`, `tailwind-merge`, `use-font-face-observer`.

**Potential issue:** `@storybook/addon-designs` is pinned at `11.1.2` while the rest of the Storybook ecosystem in this package uses `10.2.13`. Storybook addon-designs 11.x targets Storybook 9+/10+, but this version mismatch should be verified — if Storybook core is being upgraded, this addon can likely track along.

---

### `packages/services`

> Axios API client services.

**Outdated dependencies:**

| Dependency  | Current   | Latest   | Type  | Notes               |
| ----------- | --------- | -------- | ----- | ------------------- |
| `file-type` | `^22.0.0` | `22.0.1` | patch | MIME type detection |

**Up-to-date / no action:** `axios` (catalog), all workspace packages.

---

### `packages/shared-state`

> MobX stores for shared app state.

**Outdated dependencies:**

| Dependency | Current            | Latest   | Type  | Notes          |
| ---------- | ------------------ | -------- | ----- | -------------- |
| `mobx`     | `6.15.0` (catalog) | `6.15.4` | patch | Update catalog |

**Up-to-date / no action:** `lodash-es`, `mobx-utils`, `uuid`, `zod`, all workspace packages.

---

### `packages/tailwind-config`

> Tailwind CSS v4 + PostCSS config package.

**Outdated dependencies:**

| Dependency | Current | Latest   | Type  | Notes                                                                |
| ---------- | ------- | -------- | ----- | -------------------------------------------------------------------- |
| `postcss`  | `8.5.8` | `8.5.15` | patch | Also overridden to 8.5.10 by root; root override also needs updating |

**Up-to-date / no action:** `@tailwindcss/postcss` (4.2.2), `tailwindcss` (4.2.2).

**Note:** Two postcss versions are in play: `8.5.8` declared here, overridden to `8.5.10` by the root `pnpm.overrides`. Both need to be bumped to `8.5.15`.

---

### `packages/types`

> TypeScript type definitions only. No runtime dependencies.

**Outdated dependencies:** None — no runtime deps; only catalog devDeps.

---

### `packages/typescript-config`

> Shared tsconfig files only. No dependencies at all.

**Outdated dependencies:** N/A.

---

### `packages/ui`

> Legacy UI component library. BlueprintJS + Headless UI + Atlaskit DnD. Webpack-based Storybook.

**Outdated dependencies:**

| Dependency                             | Current            | Latest      | Type  | Notes                                      |
| -------------------------------------- | ------------------ | ----------- | ----- | ------------------------------------------ |
| `@atlaskit/pragmatic-drag-and-drop`    | `1.7.10` (catalog) | `1.8.1`     | minor | Update catalog                             |
| `@blueprintjs/core`                    | `^6.9.1`           | `6.15.0`    | minor | Same major v6; check component API changes |
| `@chromatic-com/storybook` (devDep)    | `^5.0.1`           | `5.2.1`     | minor | Visual regression CI; dev tool             |
| `@storybook/addon-links` (devDep)      | `^10.2.13`         | patch/minor | minor | Update with storybook core                 |
| `@storybook/addon-onboarding` (devDep) | `^10.2.13`         | patch/minor | minor | Update with storybook core                 |
| `@storybook/react` (devDep)            | `^10.2.13`         | patch/minor | minor | Update with storybook core                 |
| `@storybook/react-webpack5` (devDep)   | `^10.2.13`         | patch/minor | minor | Update with storybook core                 |
| `storybook` (devDep)                   | `10.2.13`          | patch/minor | minor | Core storybook                             |

**Up-to-date / no action:** `@atlaskit/pragmatic-drag-and-drop-hitbox`, `@blueprintjs/popover2`, `@headlessui/react`, all `@plane/*` workspace packages, `@popperjs/core`, `@radix-ui/react-scroll-area`, `clsx`, `lodash-es`, `lucide-react`, `react-color`, `react-day-picker`, `react-popper`, `tailwind-merge`, `use-font-face-observer`.

**Notes:**

- `@blueprintjs/popover2 ^2.1.32` is a separate compatibility shim alongside `@blueprintjs/core ^6.9.1`. These should be checked when upgrading BlueprintJS core to ensure popover2 compatibility with the newer version.
- `@storybook/addon-styling-webpack ^3.0.0` and `@storybook/addon-webpack5-compiler-swc ^4.0.2` are pinned to different major versions; verify Storybook 10.x compatibility.

---

### `packages/utils`

> Shared utility functions including HTML→Markdown pipeline and sanitization.

**Outdated dependencies:**

| Dependency                      | Current  | Latest   | Type  | Notes                                          |
| ------------------------------- | -------- | -------- | ----- | ---------------------------------------------- |
| `sanitize-html`                 | `2.17.1` | `2.17.4` | patch | HTML sanitizer security/bug fixes — prioritize |
| `@types/sanitize-html` (devDep) | `2.16.0` | `2.16.1` | patch | Type definitions update                        |

**Up-to-date / no action:** `chroma-js`, `clsx`, `date-fns`, `hast`, `hast-util-to-mdast`, `lodash-es`, `lucide-react`, `mdast`, `react`, `rehype-parse`, `rehype-remark`, `remark-gfm`, `remark-stringify`, `tailwind-merge`, `unified`, `uuid`, all workspace packages.

---

## Section 4: Update Priority Summary

### Priority 1 — Patch Updates (Low Risk, Apply Together)

These are safe to batch-update in a single PR against the catalog / individual packages. No breaking changes expected.

| Package                                | Current          | Latest    | Semver | Affected Locations                              | Action                                        |
| -------------------------------------- | ---------------- | --------- | ------ | ----------------------------------------------- | --------------------------------------------- |
| `vite`                                 | `8.0.3`          | `8.0.14`  | patch  | catalog → admin, space, web (devDep)            | Update catalog                                |
| `mobx`                                 | `6.15.0`         | `6.15.4`  | patch  | catalog → admin, space, web, shared-state       | Update catalog                                |
| `postcss`                              | `8.5.8 / 8.5.10` | `8.5.15`  | patch  | root override + tailwind-config + editor devDep | Update both root override AND tailwind-config |
| `turbo`                                | `2.9.5`          | `2.9.14`  | patch  | root `devDependencies`                          | Update root                                   |
| `@tanstack/react-virtual`              | `3.13.19`        | `3.13.25` | patch  | apps/admin                                      | Update apps/admin                             |
| `@tanstack/virtual-core`               | `3.13.19`        | `3.13.25` | patch  | apps/admin                                      | Update apps/admin                             |
| `@fontsource/material-symbols-rounded` | `5.2.37`         | `5.2.45`  | patch  | apps/admin, apps/space, apps/web                | Update each app                               |
| `isbot`                                | `5.1.35`         | `5.1.40`  | patch  | apps/admin, apps/space, apps/web                | Update each app                               |
| `serve`                                | `14.2.5`         | `14.2.6`  | patch  | apps/admin, apps/web                            | Update each app                               |
| `react-is`                             | `19.2.4`         | `19.2.6`  | patch  | apps/web                                        | Update apps/web                               |
| `yjs`                                  | `13.6.29`        | `13.6.30` | patch  | packages/editor + apps/live                     | Update both together                          |
| `effect`                               | `3.21.0`         | `3.21.2`  | patch  | apps/live                                       | Update apps/live                              |
| `ioredis`                              | `5.10.0`         | `5.10.1`  | patch  | apps/live                                       | Update apps/live                              |
| `linkifyjs`                            | `4.3.2`          | `4.3.3`   | patch  | packages/editor                                 | Update packages/editor                        |
| `@floating-ui/dom`                     | `1.7.5`          | `1.7.6`   | patch  | packages/editor                                 | Update packages/editor                        |
| `file-type`                            | `22.0.0`         | `22.0.1`  | patch  | packages/services                               | Update packages/services                      |
| `sanitize-html`                        | `2.17.1`         | `2.17.4`  | patch  | packages/utils                                  | Update packages/utils (**prioritize**)        |
| `@types/sanitize-html`                 | `2.16.0`         | `2.16.1`  | patch  | packages/utils devDep                           | Update packages/utils                         |

---

### Priority 2 — Minor Updates (Medium Risk, Test After Applying)

These introduce new features or behavioral improvements. Test in affected apps before merging.

| Package                             | Current   | Latest      | Semver | Affected Locations                   | Breaking Change Notes                                                                                                                                                                                                                                 |
| ----------------------------------- | --------- | ----------- | ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-router`                      | `7.14.0`  | `7.15.1`    | minor  | catalog → admin, space, web          | React Router 7.15 may introduce new route module conventions or modify loader/action type inference. Run `react-router typegen` and `check:types` after upgrade. Review 7.15.x CHANGELOG for any deprecated route config patterns.                    |
| `@react-router/dev`                 | `7.14.0`  | `7.15.1`    | minor  | catalog (devDep) → admin, space, web | Typegen tooling; aligns with runtime version.                                                                                                                                                                                                         |
| `@react-router/node`                | `7.14.0`  | `7.15.1`    | minor  | catalog → admin, space, web          | Node adapter; keep version aligned with `react-router`.                                                                                                                                                                                               |
| `@react-router/serve`               | `7.14.0`  | `7.15.1`    | minor  | catalog → apps/space                 | SSR serve adapter; critical path for `apps/space` — smoke-test SSR routes.                                                                                                                                                                            |
| `@atlaskit/pragmatic-drag-and-drop` | `1.7.10`  | `1.8.1`     | minor  | catalog → apps/web, packages/ui      | New DnD capabilities/fixes. No known breaking changes in 1.8.x; test board/kanban views in apps/web.                                                                                                                                                  |
| `@react-pdf/renderer`               | `4.3.2`   | `4.5.1`     | minor  | apps/live, apps/web                  | PDF layout engine changes — test all PDF export flows (issue export, page export). Review 4.4 / 4.5 CHANGELOG for deprecated layout props.                                                                                                            |
| `@react-pdf/types`                  | `2.9.2`   | `2.11.1`    | minor  | apps/live                            | TypeScript types; update alongside renderer. May surface new required props.                                                                                                                                                                          |
| `@blueprintjs/core`                 | `6.9.1`   | `6.15.0`    | minor  | packages/ui                          | Six minor versions. BlueprintJS 6.x: check component prop renames and deprecated API removal between 6.9 and 6.15. Pay attention to `Popover2`, `Overlay2`, and form control changes. Also verify `@blueprintjs/popover2 ^2.1.32` remains compatible. |
| `@chromatic-com/storybook`          | `5.0.1`   | `5.2.1`     | minor  | packages/ui devDep                   | Chromatic CI addon; dev/CI tool only. Review Chromatic 5.2 docs for any config changes.                                                                                                                                                               |
| `storybook` + `@storybook/*`        | `10.2.13` | latest 10.x | minor  | packages/ui, packages/propel devDeps | Storybook minor bumps within 10.x. Run `storybook` and `build-storybook` to verify after updating.                                                                                                                                                    |

---

### Priority 3 — Pre-existing Major Version Gaps (Not in Outdated Output — Informational)

These are not currently flagged as outdated but represent longer-term migration work:

| Package                     | In Use         | Latest Major           | Affected                      | Notes                                                                                                                                                                |
| --------------------------- | -------------- | ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@headlessui/react`         | `^1.7.x`       | v2.x                   | admin, space, web, ui, editor | Headless UI v2 has a rewritten API (no `as` prop pattern, new composition model). Migration required but significant effort.                                         |
| `react-color`               | `^2.19.3`      | unmaintained           | web, ui                       | No updates since 2020. Consider replacing with `frimousse` (already in propel) or `react-colorful`.                                                                  |
| `@blueprintjs/popover2`     | `^2.1.32`      | merged into core v6    | ui                            | The `popover2` shim package is a compatibility bridge. As `@blueprintjs/core` is upgraded, eventually `popover2` should be replaced with core Popover APIs.          |
| `react-masonry-component`   | `^6.3.0`       | unmaintained           | web                           | Legacy masonry layout lib. Consider native CSS masonry or an active alternative if layout issues arise.                                                              |
| `react-popper`              | `^2.3.0`       | effectively superseded | space, web, ui                | Popper.js/react-popper is largely superseded by `@floating-ui`. `@plane/editor` already uses `@floating-ui/dom`. Consider migrating `react-popper` usages over time. |
| `@base-ui-components/react` | `1.0.0-beta.3` | still in beta          | propel                        | Base UI is pre-1.0; monitor for stable release and potential API changes.                                                                                            |

---

### Storybook Version Consistency Check

| Package                     | `packages/ui` | `packages/propel` | Status                                                       |
| --------------------------- | ------------- | ----------------- | ------------------------------------------------------------ |
| `storybook`                 | `10.2.13`     | `10.2.13`         | Consistent                                                   |
| `@storybook/react-webpack5` | `^10.2.13`    | —                 | ui uses webpack, propel uses vite                            |
| `@storybook/react-vite`     | —             | `10.2.13`         | Propel only                                                  |
| `@storybook/addon-docs`     | —             | `10.2.13`         | Propel only                                                  |
| `@storybook/addon-designs`  | —             | **`11.1.2`**      | **Version mismatch** — addon-designs 11.x while core is 10.x |
| `@chromatic-com/storybook`  | `^5.0.1`      | —                 | ui only                                                      |

**Action:** Verify `@storybook/addon-designs@11.1.2` is compatible with `storybook@10.2.13`. If not, pin to the 10.x-compatible version.

---

### Recommended Update Execution Order

```
1. Patch-safe catalog updates (single PR):
   pnpm-workspace.yaml: vite 8.0.14, mobx 6.15.4, react-router 7.15.1,
   @react-router/* 7.15.1, @atlaskit/pragmatic-drag-and-drop 1.8.1
   root package.json override: postcss 8.5.15
   root package.json devDeps: turbo 2.9.14

2. Per-package patches (single PR):
   packages/utils: sanitize-html 2.17.4, @types/sanitize-html 2.16.1
   packages/editor: linkifyjs 4.3.3, @floating-ui/dom 1.7.6, yjs 13.6.30, postcss 8.5.15
   packages/tailwind-config: postcss 8.5.15
   packages/services: file-type 22.0.1
   apps/live: effect 3.21.2, ioredis 5.10.1, yjs 13.6.30
   apps/admin, apps/space, apps/web: isbot 5.1.40, @fontsource/material-symbols-rounded 5.2.45
   apps/admin, apps/web: serve 14.2.6
   apps/admin: @tanstack/react-virtual 3.13.25, @tanstack/virtual-core 3.13.25
   apps/web: react-is 19.2.6

3. Minor updates (separate PRs per area, with testing):
   PR A: @react-pdf/renderer 4.5.1 + @react-pdf/types 2.11.1 (apps/live, apps/web) + PDF export smoke tests
   PR B: @blueprintjs/core 6.15.0 (packages/ui) + Storybook build + visual regression
   PR C: Storybook 10.x updates (packages/ui, packages/propel devDeps) + storybook build verification
   PR D: @chromatic-com/storybook 5.2.1 + CI pipeline check

4. Validate after each step:
   pnpm check:types
   pnpm check:lint
   pnpm build
```
