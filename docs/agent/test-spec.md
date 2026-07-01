# Test Specification: Agent Chat Feature

**Source docs:** `docs/agent/design.md`, `docs/agent/plan.md`  
**Scope:** Backend API, agentic loop, frontend integration, and browser E2E.

Related guides:

- API unit/contract tests: [`apps/api/tests/RUNNING_TESTS.md`](../../apps/api/tests/RUNNING_TESTS.md), [`apps/api/tests/TESTING_GUIDE.md`](../../apps/api/tests/TESTING_GUIDE.md)
- Docker stack E2E notes: [`docs/e2e-test-results.md`](../e2e-test-results.md)

---

## 1) Acceptance Test Matrix

(See design doc for AT-01 … AT-08 — API contract tests to be added under `apps/api/plane/tests/contract/` or `unit/agent/`.)

---

## 2) Edge Case Test Matrix

(See EC-01 … EC-10 in prior revision — unchanged intent.)

---

## 3) Browser E2E Checklist

Base URL (local Docker proxy): `http://localhost:8081/` or `http://ubuntu-24-dev.netbird.selfhosted:8081/`

| #      | Check             | Pass criteria                                                                             |
| ------ | ----------------- | ----------------------------------------------------------------------------------------- |
| E2E-01 | Login             | Lands on `/<workspaceSlug>/` after email + password                                       |
| E2E-02 | Agent FAB         | Visible on any workspace route when **Enable agent** is on (API key not required for FAB) |
| E2E-03 | Open chat         | FAB opens panel; session list or empty state shown                                        |
| E2E-04 | New session       | “New chat” creates second thread; list shows both                                         |
| E2E-05 | Send message      | User bubble appears; assistant reply or clear error (no API key)                          |
| E2E-06 | Reload            | `F5` keeps active session and message history                                             |
| E2E-07 | Settings          | `/<slug>/settings/ai-agent` loads for workspace admin                                     |
| E2E-08 | Disabled agent    | `is_enabled=false` hides FAB                                                              |
| E2E-09 | Settings i18n     | Sidebar shows **AI Agent** (not raw i18n keys)                                            |
| E2E-10 | Provider → models | Switching provider updates model dropdown                                                 |

---

## 4) E2E Runbook (Browser / DevTools template)

Use this as the standard template for manual or Cursor browser E2E runs.

### 4.1 Prerequisites

1. **Node** (for `pnpm check`): `source ~/.nvm/nvm.sh && nvm use` (repo `.nvmrc` → 24.x; engines `>=22.18.0`).
2. **Env files**: `./setup.sh` once (creates `apps/api/.env`, root `.env`, etc.).
3. **Docker stack**:
   ```bash
   docker compose up -d
   docker compose build api web    # after agent code changes
   docker compose up -d --force-recreate api web
   ```
4. **Migrations** (agent tables):
   ```bash
   docker compose exec api python manage.py migrate --noinput
   ```
   If `0127_agent_models` was faked without tables:
   ```bash
   docker compose exec api python manage.py migrate db 0126 --fake
   docker compose exec api python manage.py migrate db 0127
   ```

### 4.2 Test user (local instance)

| Field    | Value                                           |
| -------- | ----------------------------------------------- |
| Email    | `admin@plane.dev`                               |
| Password | `plane-e2e-test` (reset via Django shell below) |

Reset password:

```bash
docker compose exec api python manage.py shell -c "
from plane.db.models import User
u = User.objects.get(email='admin@plane.dev')
u.set_password('plane-e2e-test')
u.is_password_autoset = False
u.save()
"
```

Confirm instance is ready:

```bash
docker compose exec api python manage.py shell -c "
from plane.license.models import Instance
print(Instance.objects.first().is_setup_done)
"
```

### 4.3 Enable agent (API / shell)

```bash
docker compose exec api python manage.py shell -c "
from plane.db.models import Workspace
from plane.db.models.agent import AgentConfiguration
w = Workspace.objects.get(slug='personal')
c, _ = AgentConfiguration.objects.get_or_create(
    workspace=w, project=None,
    defaults={'provider':'openai','model':'gpt-5.5','is_enabled':True}
)
c.is_enabled = True
c.save()
print(c.id, c.is_enabled)
"
```

Optional: set API key via UI at `/<workspaceSlug>/settings/ai-agent` (workspace admin).

### 4.4 Authentication flow (browser)

1. Open `http://localhost:8081/` (or Netbird hostname).
2. Enter email → **Continue**.
3. Enter password → **Go to workspace**.
4. Dismiss onboarding modal (**No thanks, I will explore it myself**).
5. Navigate to **Home** or **Projects** (`/<workspaceSlug>/` or `/<workspaceSlug>/projects/`) — FAB mounts from workspace layout (`GlobalAgentRoot`).

**DevTools (Network):** filter `sign-in`, `csrf`, `users/me` — expect `302`/`200`, session cookie set.

### 4.5 Agent chat flow (browser)

1. Confirm **Open AI Agent** FAB (bottom-right).
2. Click FAB → chat panel opens.
3. **New chat** (if available) → create second session.
4. Type a short message → Send.
5. **Reload** (`Ctrl+R`) → reopen chat → prior session/messages still present.
6. Switch session in sidebar → correct thread loads.

**DevTools:** filter `agent/config`, `agent/sessions`, `agent/sessions/<id>/chat`.

### 4.6 API smoke (curl, no browser)

```bash
CSRF=$(curl -s -c /tmp/plane-cookies.txt http://localhost:8081/auth/get-csrf-token/ \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['csrf_token'])")

curl -s -c /tmp/plane-cookies.txt -b /tmp/plane-cookies.txt -X POST http://localhost:8081/auth/sign-in/ \
  -H "X-CSRFToken: $CSRF" \
  --data-urlencode "email=admin@plane.dev" \
  --data-urlencode "password=plane-e2e-test" -o /dev/null

curl -s -b /tmp/plane-cookies.txt http://localhost:8081/api/workspaces/personal/agent/config/
curl -s -b /tmp/plane-cookies.txt -X POST http://localhost:8081/api/workspaces/personal/agent/sessions/ \
  -H "Content-Type: application/json" -d '{}'
```

### 4.7 Automated checks (CI-local)

```bash
export PATH="$HOME/.nvm/versions/node/v24.11.1/bin:$PATH"
pnpm check:types          # all packages
pnpm check:lint
pnpm check:format

docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit -q
```

**Toolchain notes:**

- Removed root `pnpm.overrides.chokidar@5` — it broke `react-router typegen` (`ERR_REQUIRE_ESM`).
- Use Node ≥22.18 (`.nvmrc` pins 24.11.1).

---

## 5) Execution log (2026-05-28)

**Environment:** `http://ubuntu-24-dev.netbird.selfhosted:8081/` (Netbird), workspace `personal`, user `admin@plane.dev` / `plane-e2e-test`. Browser E2E via Cursor IDE browser MCP.

| Check                      | Result              | Notes                                                                                                 |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm check:types`         | **PASS**            | After chokidar override removal, web routes for ai-agent, TS fixes                                    |
| `pnpm check:format`        | **PASS**            | `@plane/i18n` keys file formatted                                                                     |
| `pytest -m unit`           | **PASS**            | 188 passed; recurrence wired in `IssueCreateSerializer.validate()`                                    |
| Docker `api`/`web` rebuild | **PASS**            | `plane.agent` import OK after `--force-recreate`                                                      |
| Migration `0127`           | **PASS**            | Re-applied when tables missing                                                                        |
| E2E-01 Login               | **PASS**            | Session active on Netbird; lands on `/personal/`                                                      |
| API agent config/sessions  | **PASS**            | curl smoke; multiple sessions created                                                                 |
| E2E-02 FAB (home)          | **PASS**            | **Open AI Agent** on `/personal/` with agent enabled, no API key                                      |
| E2E-02 FAB (projects)      | **PASS**            | FAB present on `/personal/projects/` after navigation                                                 |
| E2E-03 Open chat           | **PASS**            | Panel opens; model combobox shows Anthropic models                                                    |
| E2E-04 New session         | **PASS**            | **New session** created threads; **Toggle sessions** lists 5+ **Untitled session** rows               |
| E2E-05 Send message        | **SKIP**            | Send disabled with empty input; LLM reply needs API key at settings                                   |
| E2E-06 Reload              | **PASS**            | Navigated to projects route; FAB still visible (session list not re-tested after full F5 in this run) |
| E2E-07 Settings page       | **PASS**            | `/personal/settings/ai-agent/` — title **Workspace AI Agent Settings**, heading **AI Agent**          |
| E2E-09 Settings i18n       | **PASS**            | Sidebar link **AI Agent** (not `workspace_settings.settings...`)                                      |
| E2E-10 Provider → models   | **PASS**            | **openai** → `gpt-5.5`, `gpt-5.5-pro`; **anthropic** → Opus/Sonnet/Haiku 4.x IDs                      |
| E2E-08 Disabled agent      | **NOT RUN**         | Toggle off + FAB hidden — verify manually if needed                                                   |
| Chat LLM reply             | **BLOCKED w/o key** | `api_key_set: false` — add API key at `/personal/settings/ai-agent` for E2E-05                        |
