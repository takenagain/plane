# Test/Dev Environment Setup Notes (Hours Logged Analytics E2E)

This documents environment setup/actions performed while running `e2e/tests/analytics-hours-logged.spec.ts` on March 3, 2026.

## Node / pnpm

- Used Node 24 in each Node/pnpm command:
  - `source ~/.nvm/nvm.sh && nvm use 24 && ...`
- Installed e2e dependencies in standalone `e2e` package:
  - `cd e2e && pnpm install --ignore-workspace`

## Playwright

- Verified Playwright browsers are present in cache:
  - `cd e2e && pnpm exec playwright install --list`
- Chromium and related Playwright browser binaries are available under `~/.cache/ms-playwright`.

## Env files created/updated

- Created root env file from template:
  - `.env` from `.env.example`
- Created API env file from template:
  - `apps/api/.env` from `apps/api/.env.example`
- Created Web env file from template:
  - `apps/web/.env` from `apps/web/.env.example`
- Updated API env with required key:
  - Added `SECRET_KEY="dev-local-secret-key-for-e2e"` to `apps/api/.env`

## Podman / services

- Brought up local stack with Podman Compose:
  - `podman-compose -f docker-compose-local.yml up -d`
- Rebuilt local API-related images:
  - `podman-compose -f docker-compose-local.yml up -d --build`
- Recreated API services after env changes:
  - `podman-compose -f docker-compose-local.yml up -d --force-recreate api worker beat-worker`
- Verified running containers with:
  - `podman ps --format '{{.Names}} {{.Status}} {{.Ports}}'`

## API runtime fixes performed

- Ran API migrations manually:
  - `podman exec plane-time-tracking-analytics_api_1 python manage.py migrate --settings=plane.settings.local`
- Confirmed local instance existed but was not marked setup-complete (`is_setup_done=False`).
- Marked instance as setup-complete in Django shell:
  - `podman exec plane-time-tracking-analytics_api_1 python manage.py shell --settings=plane.settings.local -c "... is_setup_done=True ..."`
- Verified auth now succeeds via direct curl flow (`/auth/get-csrf-token/`, `/auth/sign-in/`, `/api/users/me/`).

## E2E run configuration used

- For split web/api local setup, tests were run with:
  - `BASE_URL=http://127.0.0.1:3000`
  - `E2E_API_BASE_URL=http://127.0.0.1:8000`
- Web dev server started with:
  - `pnpm turbo run dev --filter=web`

## Remaining blocker observed

- API auth and data endpoints are now reachable, but the web route for analytics displays a startup failure page:
  - `Looks like Plane didn't start up correctly!`
- Because of that page, UI assertion in analytics E2E test 1 fails before it can validate chart interactions.
- API-only portions are no longer blocked by `INSTANCE_NOT_CONFIGURED`/`SECRET_KEY` issues.

## Notes on test artifacts

- Playwright artifacts were generated in:
  - `e2e/test-results/`
  - `e2e/playwright-report/`
