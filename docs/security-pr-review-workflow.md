# Security PR Review Workflow — Plane

> Structured workflow for performing security-focused code reviews on PRs targeting the `preview` or `main` branches.

---

## 1. Overview

Plane is a monorepo containing a Django REST API backend, three React frontend applications, a WebSocket real-time collaboration server, and shared TypeScript packages. The attack surface spans:

| Layer                | Component                             | Key Risks                                                                                    |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Backend API**      | `apps/api/plane/` (Django + DRF)      | Injection (SQL, ORM), broken access control, IDOR, mass assignment, insecure deserialization |
| **Authentication**   | `apps/api/plane/authentication/`      | Credential stuffing, OAuth misconfiguration, session fixation, magic link abuse              |
| **Permissions**      | `apps/api/plane/app/permissions/`     | Privilege escalation, missing permission checks on new endpoints                             |
| **Background Tasks** | `apps/api/plane/bgtasks/` (Celery)    | Unsafe file operations, SSRF in webhooks, race conditions                                    |
| **Database Models**  | `apps/api/plane/db/`                  | Migration safety, default value issues, constraint bypass                                    |
| **Public API (v1)**  | `apps/api/plane/api/`                 | Unauthenticated access, over-exposed fields, rate limiting bypass                            |
| **Space (Public)**   | `apps/api/plane/space/`               | Public data leakage, unauthenticated enumeration                                             |
| **Frontend (Web)**   | `apps/web/`                           | XSS (stored/reflected), open redirects, client-side auth bypass                              |
| **Frontend (Admin)** | `apps/admin/`                         | Admin-only endpoints exposed, CSRF                                                           |
| **Frontend (Space)** | `apps/space/`                         | Public-facing XSS, data exposure                                                             |
| **Real-time (Live)** | `apps/live/`                          | WebSocket auth bypass, message injection                                                     |
| **Services layer**   | `packages/services/`                  | API client misuse, credential leakage                                                        |
| **Editor**           | `packages/editor/`                    | XSS through rich text, malicious HTML/markdown                                               |
| **Proxy**            | `apps/proxy/`                         | Misconfigured reverse proxy, path traversal                                                  |
| **Deployment**       | `deployments/`, `docker-compose*.yml` | Exposed ports, default credentials, insecure env vars                                        |
| **CI/CD**            | `.github/workflows/`                  | Secret exposure, script injection, untrusted PR execution                                    |

---

## 2. Pre-Review Setup

### 2.1 Generate the Diff

```bash
# Full diff for staging → preview merge
git diff preview..staging > tmp/security-review/full-diff.patch

# Split per file for manageable review
# (use the Python splitter script or csplit)
```

### 2.2 Categorize Changed Files by Risk

**Priority 1 — Critical (review first):**

- `apps/api/plane/authentication/` — Auth flows
- `apps/api/plane/app/permissions/` — Access control
- `apps/api/plane/app/views/` — API endpoints
- `apps/api/plane/api/views/` — Public API v1 endpoints
- `apps/api/plane/space/views/` — Public-facing views
- `apps/api/plane/db/models/` — Data model changes
- `apps/api/plane/db/migrations/` — Migration safety
- `apps/api/plane/utils/url.py`, `ip_address.py`, `path_validator.py` — Input validation
- `apps/proxy/` — Reverse proxy config
- `packages/services/` — API client wrappers
- `.github/workflows/` — CI/CD pipelines

**Priority 2 — High:**

- `apps/api/plane/bgtasks/` — Background task security
- `apps/api/plane/app/serializers/` — Mass assignment, field exposure
- `apps/api/plane/utils/porters/` — Import/export (file handling)
- `apps/api/plane/utils/filters/` — Query filter injection
- `packages/editor/` — Rich text XSS
- `apps/web/core/` — Sensitive frontend logic

**Priority 3 — Medium:**

- `apps/web/ce/` — Community edition stubs (functional correctness)
- `apps/api/plane/utils/` — Utility functions
- `packages/types/` — Type definitions (correctness)
- `packages/constants/` — Configuration values
- `e2e/` — Test coverage gaps

**Priority 4 — Low:**

- `apps/web/` UI components (non-auth, non-data)
- `packages/i18n/` — Translations
- `packages/ui/`, `packages/propel/` — UI primitives
- Documentation files

---

## 3. Review Checklist per OWASP Top 10

### A01:2021 — Broken Access Control

- [ ] Every new/modified endpoint has appropriate permission class
- [ ] Object-level permissions check workspace/project membership
- [ ] No IDOR: IDs from URL params are validated against user's access scope
- [ ] Serializer fields don't expose data beyond the user's role
- [ ] Public/Space endpoints don't leak private data

### A02:2021 — Cryptographic Failures

- [ ] No secrets hardcoded (API keys, tokens, passwords)
- [ ] Sensitive data not logged or exposed in error responses
- [ ] Proper use of Django's signing/hashing utilities
- [ ] TLS enforced for external connections

### A03:2021 — Injection

- [ ] No raw SQL queries; all queries use ORM with parameterized inputs
- [ ] No `eval()`, `exec()`, or `subprocess` with user input
- [ ] Frontend renders user content safely (no `dangerouslySetInnerHTML` without sanitization)
- [ ] Editor content sanitized on save/render
- [ ] URL construction uses proper escaping

### A04:2021 — Insecure Design

- [ ] Rate limiting on authentication endpoints
- [ ] Business logic flaws (e.g., can a viewer modify issues?)
- [ ] Timer/worklog race conditions handled
- [ ] Recurrence logic has termination conditions

### A05:2021 — Security Misconfiguration

- [ ] Django DEBUG not enabled in production settings
- [ ] CORS/CSRF configuration not overly permissive
- [ ] Proxy config doesn't allow path traversal
- [ ] Docker Compose doesn't expose internal services
- [ ] CI workflows don't run untrusted code with write permissions

### A06:2021 — Vulnerable Components

- [ ] No new dependencies with known CVEs
- [ ] `pnpm-lock.yaml` changes reviewed for unexpected additions

### A07:2021 — Authentication Failures

- [ ] OAuth callback validates state parameter
- [ ] Magic link tokens are single-use and time-limited
- [ ] Session management is secure (HttpOnly, Secure, SameSite)

### A08:2021 — Data Integrity Failures

- [ ] Serializers validate all input fields
- [ ] File upload validates content type and size
- [ ] Migration applies constraints atomically

### A09:2021 — Logging & Monitoring Failures

- [ ] Security events (auth failures, permission denials) are logged
- [ ] No sensitive data in logs

### A10:2021 — SSRF

- [ ] Webhooks validate destination URLs
- [ ] S3/MinIO operations use internal URLs only
- [ ] No user-controlled URLs fetched server-side without validation

---

## 4. Review Process

1. **Triage**: Categorize all changed files by risk priority
2. **Backend-first**: Review API changes starting from models → serializers → views → URLs → permissions
3. **Auth flow**: Review any authentication/authorization changes end-to-end
4. **Frontend**: Check for XSS vectors, sensitive data in client state, open redirects
5. **Infrastructure**: Review proxy, Docker, CI/CD changes
6. **Cross-cutting**: Check for new dependencies, environment variable changes, migration safety
7. **Document**: Record all findings with severity, file, line, and remediation

### Severity Levels

| Level        | Description                                      | Action                          |
| ------------ | ------------------------------------------------ | ------------------------------- |
| **Critical** | RCE, auth bypass, SQL injection                  | Block merge, fix immediately    |
| **High**     | IDOR, privilege escalation, XSS, data leak       | Block merge, fix before release |
| **Medium**   | Missing validation, weak defaults, info exposure | Fix recommended, non-blocking   |
| **Low**      | Code quality, minor hardening                    | Track in backlog                |
| **Info**     | Observations, suggestions                        | Note for future improvement     |

---

## 5. Post-Review

- [ ] All Critical/High issues have been addressed
- [ ] Security findings documented in PR comments
- [ ] New endpoints have corresponding test coverage
- [ ] Migration can be rolled back safely
- [ ] No regressions in existing security controls
