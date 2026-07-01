# Docker Stack E2E Test Results

**Date/Time:** 2026-05-26 (initial run + iterative fixes)
**Tester:** Zed Coding Agent (automated)
**Tool:** Docker Compose v5.1.4 (`docker compose`)
**Note:** `podman-compose` was not installed; fell back to `docker compose`.

---

## Final Status: ALL ISSUES FIXED ✅

| Container | Status | Notes |
|---|---|---|
| proxy | ✅ Running | HTTP 200 on port 8081 |
| web | ✅ Running (healthy) | HTTP 200 |
| admin | ✅ Running (healthy) | HTTP 200 |
| space | ✅ Running (healthy) | HTTP 200 |
| api | ✅ Running | Gunicorn 26.0.0, uvicorn workers |
| bgworker | ✅ Running | Task registration fixed (see below) |
| beatworker | ✅ Running | Beat schedule running |
| plane-migrator | ✅ Exited (0) | 126 migrations applied |
| plane-live | ✅ Running | Redis connected, Express server on :3000 |
| plane-db | ✅ Running | PostgreSQL 15.7 |
| plane-redis | ✅ Running | Valkey 7.2.11 |
| plane-mq | ✅ Running | RabbitMQ 3.13.6 |
| plane-minio | ✅ Running | MinIO, uploads bucket created |

**HTTP Tests (curl from host):**
- `http://localhost:8081/` → **HTTP 200** ✅
- `http://localhost:8081/sign-in/` → **HTTP 200** ✅

---

## Commits Applied (all on `staging` branch)

| SHA | Description |
|---|---|
| `4da5a80e9c` | fix(backend): add django.contrib.postgres to INSTALLED_APPS |
| `6eac3ff219` | fix(frontend): auto-fix format and lint issues |
| `88c8b21cca` | fix(live): add required env vars to docker-compose.yml for plane-live service |
| `f20b3b4972` | fix(backend): add missing task modules to CELERY_IMPORTS |

---

## Issues Found & Fixed

### Issue 1 (CRITICAL — FIXED): API crash on startup — `postgres.E005`

**Symptom:** API container exited immediately with:
```
ERRORS:
db.ExporterHistory.project: (postgres.E005) 'django.contrib.postgres' must be in INSTALLED_APPS in order to use ArrayField.
db.IssueActivity.attachments: (postgres.E005) 'django.contrib.postgres' must be in INSTALLED_APPS in order to use ArrayField.
db.IssueComment.attachments: (postgres.E005) 'django.contrib.postgres' must be in INSTALLED_APPS in order to use ArrayField.
db.IssueVersion.assignees: (postgres.E005) 'django.contrib.postgres' must be in INSTALLED_APPS in order to use ArrayField.
db.IssueVersion.labels: (postgres.E005) 'django.contrib.postgres' must be in INSTALLED_APPS in order to use ArrayField.
db.IssueVersion.modules: (postgres.E005) 'django.contrib.postgres' must be in INSTALLED_APPS in order to use ArrayField.
```
**Root cause:** `django.contrib.postgres` was missing from `INSTALLED_APPS` in
`apps/api/plane/settings/common.py`. It was never added despite the codebase using
`ArrayField` and `ArrayAgg` from `django.contrib.postgres` extensively (added in upstream
sync of new models: `IssueVersion`, `IssueComment`, `IssueActivity`, `ExporterHistory`).
**Fix:** Added `"django.contrib.postgres"` to `INSTALLED_APPS`. Commit `4da5a80e9c`.

---

### Issue 2 (CRITICAL — FIXED): `plane-live` crash-loops — missing required env vars

**Symptom:** `plane-live` exited on every start with exit code 1 (CrashLoopBackoff):
```
[dotenv@17.3.1] injecting env (0) from .env
❌ Invalid environment variables: {
    "API_BASE_URL": { "_errors": ["Required"] },
    "LIVE_SERVER_SECRET_KEY": { "_errors": ["Required"] }
}
```
**Root cause:** `docker-compose.yml` `live:` service had no `env_file:` or `environment:`
section, so `API_BASE_URL` and `LIVE_SERVER_SECRET_KEY` (both required by Zod validation in
`apps/live/src/env.ts`) were never passed to the container.
**Fix:** Added `env_file: [.env]` and `environment:` with required vars and local-dev
fallback defaults to the `live:` service in `docker-compose.yml`. Commit `88c8b21cca`.

---

### Issue 3 (WARNING — FIXED): `bgworker` receives unregistered Celery task every minute

**Symptom:** Every 60 seconds in `bgworker` logs:
```
[ERROR] Received unregistered task of type
  'plane.bgtasks.issue_recurrence_task.process_recurring_issues'.
The message has been ignored and discarded.
KeyError: 'plane.bgtasks.issue_recurrence_task.process_recurring_issues'
  periodic_task_name: 'check-every-minute-for-recurring-issues'
```
**Root cause:** `issue_recurrence_task.py` was added from the upstream sync and its task
was added to the beat schedule in `celery.py`, but it was NOT added to `CELERY_IMPORTS` in
`settings/common.py`. Without an explicit import, Celery's `autodiscover_tasks()` doesn't
find non-`tasks.py` modules. `cycle_automation_task` had the same gap.
**Fix:** Added `"plane.bgtasks.issue_recurrence_task"` and
`"plane.bgtasks.cycle_automation_task"` to `CELERY_IMPORTS`. Commit `f20b3b4972`.

---

### Issue 4 (INFO — not blocking): `plane-redis` memory overcommit advisory

**Message:** `WARNING Memory overcommit must be enabled! Without it, a background save or
replication may fail under low memory condition.`
**Impact:** Non-critical for local dev; background RDB saves could fail under memory
pressure.
**Fix (host-level):** `sudo sysctl vm.overcommit_memory=1` or add to `/etc/sysctl.conf`.

---

## Build Results

| Image | Status |
|---|---|
| `plane-live` | ✅ Built |
| `plane-web` | ✅ Built |
| `plane-admin` | ✅ Built |
| `plane-space` | ✅ Built |
| `plane-proxy` | ✅ Built |
| `plane-api` | ✅ Built |
| `plane-migrator` | ✅ Built (shares image with api) |
| `plane-worker` | ✅ Built (shares image with api) |
| `plane-beat-worker` | ✅ Built (shares image with api) |

All 9 custom images built successfully. External images (`postgres:15.7-alpine`,
`valkey/valkey:7.2.11-alpine`, `rabbitmq:3.13.6-management-alpine`, `minio/minio`) pulled
successfully.

---

## Frontend/Backend Check Results

| Check | Result |
|---|---|
| `pnpm install` | ✅ PASS |
| `turbo check:format` | ✅ PASS (1 file auto-fixed: `i18n/src/types/keys.generated.ts`) |
| `turbo build` | ✅ PASS (16/16 tasks) |
| `turbo check:lint` | ✅ PASS (3 warnings auto-fixed via `pnpm fix`) |
| `turbo check:types` | ✅ PASS (28/28 tasks) |
| `ruff format` (backend) | ✅ PASS (6 files reformatted) |
| `ruff check` (backend) | ✅ PASS (2 unused imports removed) |

---

## Container Log Summary

### proxy
```
{"level":"info","msg":"using config from file","file":"/etc/caddy/Caddyfile"}
{"level":"warn","msg":"HTTP/2 skipped because it requires TLS","addr":":8081"}
{"level":"info","msg":"server running","name":"srv0","protocols":["h1","h2","h3"]}
{"level":"info","msg":"serving initial configuration"}
```
Status: **Clean** — Caddy 2.11.2 serving on `:8081`. TLS not configured (HTTP only for local dev).

### web
```
nginx: ready for start up
127.0.0.1 - "GET / HTTP/1.1" 200 (healthcheck every 30s)
```
Status: **Clean** — Next.js static → nginx, healthy.

### admin
```
nginx: ready for start up
127.0.0.1 - "GET / HTTP/1.1" 200 (healthcheck every 30s)
```
Status: **Clean** — Next.js static → nginx, healthy.

### space
```
[react-router-serve] http://localhost:3000
GET /spaces/ 200 - - 13ms (healthcheck every 30s)
```
Status: **Clean** — react-router-serve, healthy.

### api
```
Waiting for database...
Database available!
DB error (ProgrammingError: relation "django_migrations" does not exist), retrying...
Waiting for migrations... (x6 retries)
No migrations Pending. Starting processes...
Instance registered
Bucket 'uploads' created successfully.
35 static files copied to '/code/plane/static-assets/collected-static'
[INFO] Starting gunicorn 26.0.0
[INFO] Listening at: http://0.0.0.0:8000
[INFO] Using worker: uvicorn.workers.UvicornWorker
```
Status: **Clean** — Initial `django_migrations` errors are expected during cold start (API waits for migrator).

### bgworker
```
celery v5.6.3 connected to amqp://plane:**@plane-mq:5672/plane
mingle: all alone
Task plane.license.bgtasks.tracer.instance_traces received
```
Status: **Clean after fix** — `issue_recurrence_task` added to `CELERY_IMPORTS`.

### beatworker
```
celery beat v5.6.3 is starting.
broker -> amqp://plane:**@plane-mq:5672/plane
scheduler -> django_celery_beat.schedulers.DatabaseScheduler
DatabaseScheduler: Schedule changed.
```
Status: **Clean** — beat connected, all schedules running.

### plane-migrator
```
Running migrations:
  Applying contenttypes.0001_initial... OK
  ...
  Applying db.0126_merge_20260331_0336... OK
  Applying django_celery_beat.0019_alter_periodictasks_options... OK
  Applying license.0006_instance_is_current_version_deprecated... OK
  Applying sessions.0001_initial... OK
```
Status: **Clean** — 126 migrations applied, exited 0 as expected.

### plane-live
```
[dotenv@17.3.1] injecting env (0) from .env
INFO  REDIS_MANAGER: Redis client connected
INFO  REDIS_MANAGER: Redis client ready
INFO  REDIS_MANAGER: Redis connection test successful
INFO  SERVER: Redis setup completed
INFO  SERVER: HocusPocus setup completed
INFO  SERVER: Express server has started at port 3000
INFO  [Redis] Subscribed to admin channel: hocuspocus:admin
INFO  [FORCE_CLOSE_HANDLER] Registered with Redis extension
```
Status: **Clean after fix** — 0 restarts, Redis connected, fully operational.

### plane-db
```
PostgreSQL 15.7 initialized on x86_64-pc-linux-musl
database system is ready to accept connections
checkpoint starting/complete at 5-min intervals
```
Status: **Clean**.

### plane-redis
```
WARNING: Memory overcommit must be enabled! (host kernel setting)
Valkey 7.2.11 starting — Running mode=standalone, port=6379
Ready to accept connections tcp
```
Status: **Clean** — advisory warning only.

### plane-mq
```
RabbitMQ 3.13.6 on Erlang 26.2.5.2
Adding vhost 'plane'
Started message store for vhost 'plane'
[broker started, management plugin active]
```
Status: **Clean**.

### plane-minio
```
INFO: Formatting 1st pool
MinIO RELEASE.2025-09-07T16-13-09Z
API: http://172.19.0.5:9000
WebUI: http://172.19.0.5:9090
```
Status: **Clean** — `uploads` bucket auto-created by API.
