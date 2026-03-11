# Agent Development Guide

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target specific package/app
- `pnpm --filter=@plane/ui storybook` - Start Storybook on port 6006

## Validation Workflow

- Frontend checks must follow `.github/workflows/pull-request-build-lint-web-apps.yml` exactly and in this order:
- `pnpm turbo run check:format --affected`
- `pnpm turbo run build --affected`
- `pnpm turbo run check:lint --affected`
- `pnpm turbo run check:types --affected`
- Backend Python lint/format must include Ruff:
- `apps/api/.venv/bin/ruff format apps/api`
- `apps/api/.venv/bin/ruff check --fix apps/api`
- Backend changes can be validated locally with `pytest` from `apps/api`
- Full GitHub workflow runs can be exercised locally with `act` (`netkos/act` is installed on this system)

## Container Runtime

- Check whether `podman`/`podman-compose` or `docker`/`docker compose` are available before running container commands
- Prefer `podman` and `podman-compose` even if both Podman and Docker are installed
- On this system (CachyOS), use `podman` and `podman-compose` for local stack startup and E2E prerequisites
- You can start the full local stack with `podman-compose up -d`
- Use non-privileged HTTP ports for compose/e2e (default `8081`) and never bind HTTP to port `80`

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@plane/ui` with Storybook for isolated development
- Before committing and pushing to remote, ensure there are no lint errors in frontend or backend
