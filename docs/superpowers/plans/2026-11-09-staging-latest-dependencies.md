# Staging latest dependencies implementation plan

**Goal:** Run staging on the latest stable dependencies, including breaking major releases, and publish all six GHCR images successfully.

**Architecture:** Keep each existing integration at its responsible layer. Migrate removed APIs, and use precise dependency overrides only where the current integration passes meaningful compatibility tests. Replace an integration only if the latest dependency cannot support its behavior.

**Spec:** The user's staging policy: latest stable versions take priority over upstream compatibility. Upstream is consumed for security updates; staging is independently maintained.

## Constraints

- Pin concrete versions and commit regenerated lockfiles.
- Preserve observable state, authentication, scheduling, collaboration persistence, and graceful shutdown.
- Keep changes in the isolated staging worktree; preserve unrelated main-checkout files.
- Push staging under the existing authorization and verify the exact SHA's six GHCR image jobs.

## Review focus

- MobX computed values must invalidate after actions and release argument caches after observers dispose.
- Redis pub/sub, database selection, distributed locks, and document saves must work across two live servers.
- Timezone-aware Celery scheduling and human-readable cron expressions must survive the new Python dependencies.
- Django startup, models, API tests, and Scout instrumentation must support the upgraded runtime.
- Old global overrides must not keep obsolete copies or silently break a consumer's export/API contract.

## Tasks

- [x] Upgrade Django to 6.1.3, cron-descriptor to 2.2.1, python-dateutil to 4.0.0, and wrapt to 2.5.2 in `apps/api`; migrate affected code and verify scheduling, instrumentation, and API behavior.
- [x] Upgrade MobX to 7.1.5 and mobx-react to 10.0.3 in the pnpm catalog; migrate removed annotations throughout apps/packages and verify `computedFn` plus representative stores/React observers.
- [x] Upgrade ioredis to 6.0.0 across the graph; verify actual Redis-backed collaboration and persistence, correcting the existing integration test to exercise the production WebSocket adapter.
- [x] Refresh the remaining catalog and override pins against registry latest stable releases, including breaking upgrades; regenerate pnpm lockfiles and resolve actual consumer failures.
- [x] Recheck the separately managed desktop/E2E dependencies, images, and GitHub action tags.
- [x] Run focused regressions, `pnpm check`, app builds, lock/peer checks, and backend checks; review the compatibility changes.

## Compatibility patches

The latest parent releases still consume Babel 7 APIs. Four pinned patches adapt their owning boundaries to Babel 8:

- `jscodeshift`: worker registration, serializable plugin paths, and parser defaults; real CLI tests preserve React prop and generic types.
- `react-transition-group`: public condition-aware Babel helper imports.
- `react-docgen`: synchronous config loading, NodePath checks, and current TypeScript AST fields; seven documentation tests cover the supported prop shapes.
- `@storybook/react-vite`: the custom component-name handler uses the current NodePath API.

UI Storybook uses the existing Vite builder pattern. Its build retains all 15 indexed story entries and emits the stylesheet.

## Publication gate

Commit and push the verified changes to `origin/staging`. Confirm all six GHCR image jobs succeed for that exact pushed SHA, run the API/web test workflows, and confirm remote/local branch agreement before reporting publication complete.
