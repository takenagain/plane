# Security Code Review: staging → preview

> **Reviewer:** AI Security Review Agent
> **Date:** 2025-03-20
> **Scope:** `git diff preview..staging` — 501 files changed, 26,546 insertions, 1,323 deletions
> **Verdict:** **APPROVE with minor observations** — No blocking security issues found.

---

## Executive Summary

This review covers a large diff introducing three major features (**worklog/time-tracking**, **issue recurrence**, **time-logged analytics**) plus extensive formatting changes (Ruff auto-formatter), CI/CD improvements, and infrastructure adjustments.

**Key findings:**

- **0 CRITICAL** / **0 HIGH** / **1 MEDIUM** / **1 LOW** security findings
- No injection vulnerabilities (SQL, XSS, command injection)
- No hardcoded secrets or credentials
- No unsafe patterns (`dangerouslySetInnerHTML`, `eval`, `exec`, `RawSQL`)
- Proper use of Django permissions, serializer `read_only_fields`, and ORM queries throughout
- CI/CD improvements add fork safety, least-privilege permissions, and ShellCheck linting

---

## Findings

### FINDING-001 [MEDIUM] — Permission creator check uses `all_objects` manager

**File:** `apps/api/plane/app/permissions/base.py`
**Lines:** `allow_permission` decorator, creator check logic

**Description:**
The `creator` permission check was changed from:

```python
model.objects.filter(...)
```

to:

```python
getattr(model, "all_objects", model._base_manager).filter(...)
```

The `all_objects` manager in Plane's codebase typically includes soft-deleted objects (`deleted_at IS NOT NULL`). This means a creator can now pass the permission check for objects they created even if those objects have been soft-deleted.

**Impact:** If any endpoint relies on the `creator=True` permission flag to grant elevated access (e.g., update or delete), a user could potentially perform operations on their own soft-deleted resources that should be inaccessible.

**Mitigating factors:**

- Worklog view endpoints (the primary consumer of `creator=True`) independently filter with `deleted_at__isnull=True` in their querysets, so soft-deleted worklogs will return 404 even if the permission check passes.
- The change may be intentional to support undo/restore workflows.

**Recommendation:** Confirm this is intentional behavior. If not, revert to using `model.objects` (the default manager with soft-delete filtering) for the creator check. If intentional, add a code comment explaining why `all_objects` is needed.

---

### FINDING-002 [LOW] — Time tracking data exposed on public deploy boards

**Files:**

- `apps/api/plane/space/views/issue.py`
- `apps/api/plane/space/views/intake.py`
- `apps/api/plane/space/utils/grouper.py`

**Description:**
The `time_logged` annotation is now added to public-facing issue querysets served by Space views. These endpoints are accessible without authentication on public deploy boards. Time tracking data reveals effort spent on individual issues.

**Impact:** Low. Public boards already expose issue title, state, assignees, labels, priority, etc. However, time-tracking data could reveal internal team velocity and effort distribution to external observers.

**Recommendation:** Confirm this is intentional product behavior. Consider making `time_logged` visibility opt-in per deploy board, or stripping it from unauthenticated responses.

---

## Feature Security Assessment

### Worklog / Time Tracking (New Feature)

| Component                                            | Status    | Notes                                                                                                                                                                    |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model (`db/models/worklog.py`)                       | ✅ Secure | `ProjectBaseModel` scoping; partial unique constraint prevents multiple active timers per user per issue; `duration` defaults to 0 (sentinel for active tracking)        |
| Serializer (`app/serializers/worklog.py`)            | ✅ Secure | `read_only_fields` includes `id`, `workspace`, `project`, `issue`, `created_by`, `updated_by`; no mass assignment risk                                                   |
| View (`app/views/issue/worklog.py`)                  | ✅ Secure | All CRUD operations protected by `@allow_permission` with appropriate role checks (MEMBER+); queryset scoped to project+issue; `created_by` enforced from `request.user` |
| URLs (`app/urls/worklog.py`)                         | ✅ Secure | Standard nested resource URL patterns with workspace/project/issue scoping                                                                                               |
| Background task (`bgtasks/issue_activities_task.py`) | ✅ Secure | Activity records properly scoped with workspace/project/issue IDs                                                                                                        |
| Frontend store (`extended/store/worklog.store.ts`)   | ✅ Secure | Standard MobX store, stale request handling, service layer abstraction                                                                                                   |
| Frontend service (`packages/services/src/worklog/`)  | ✅ Secure | Standard Axios wrapper                                                                                                                                                   |

### Issue Recurrence (New Feature)

| Component                                            | Status    | Notes                                                                                                                                                                                       |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model fields (`db/models/issue.py`)                  | ✅ Secure | Nullable fields, no schema risks                                                                                                                                                            |
| Utility (`utils/issue_recurrence.py`)                | ✅ Secure | Pattern validation against allowlist; test-only patterns gated by `settings.DEBUG`; assignee copy validates `ProjectMember.is_active` and `role >= 15`                                      |
| Background task (`bgtasks/issue_recurrence_task.py`) | ✅ Secure | `select_for_update(skip_locked=True)` prevents race conditions; atomic transactions with savepoints; `on_commit` deferred activity dispatch; forward-progress check prevents infinite loops |
| Serializer                                           | ✅ Secure | Recurrence fields properly added with validation                                                                                                                                            |

### Time-Logged Analytics

| Component                                | Status    | Notes                                                                                             |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Annotation (`utils/time_logged.py`)      | ✅ Secure | ORM subquery with `Coalesce`, no SQL injection risk                                               |
| Chart builder (`utils/build_chart.py`)   | ✅ Secure | Axis inputs validated against allowlist; `ValidationError` raised for invalid values              |
| Filterset (`utils/filters/filterset.py`) | ✅ Secure | Range filter validates input format, converts to int, returns `queryset.none()` for invalid input |

---

## Infrastructure & CI/CD Assessment

| Area                     | Status      | Notes                                                                                                                                                              |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Actions workflows | ✅ Improved | Fork safety added (`github.event.pull_request.head.repo.full_name == github.repository`); permissions set to `read` by default; ShellCheck added to lint pipelines |
| Caddyfile proxy          | ✅ Clean    | Structural refactor only; same routing rules; no new exposed paths                                                                                                 |
| Docker Compose           | ✅ Improved | Non-privileged ports (8081/8443 instead of 80/443); YAML bool fix (`restart: "no"` instead of `restart: no`)                                                       |
| `.env.example`           | ✅ Clean    | Non-privileged port defaults                                                                                                                                       |

---

## Cross-Cutting Security Checks

| Check                                       | Result                                                                |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `dangerouslySetInnerHTML` in changed files  | ✅ None found                                                         |
| `eval()` / `exec()` in production code      | ✅ None found                                                         |
| `RawSQL` / raw SQL queries                  | ✅ None found                                                         |
| Hardcoded secrets/tokens (sk-, ghp\_, AKIA) | ✅ None found                                                         |
| SQL injection vectors                       | ✅ All queries use Django ORM with parameterized values               |
| XSS vectors                                 | ✅ No unsafe rendering patterns                                       |
| CSRF protection                             | ✅ DRF framework handles CSRF; no bypass patterns found               |
| Path traversal                              | ✅ `path_validator.py` hardened (host dedup, leading `/` enforcement) |

---

## Diff Composition Breakdown

| Category                     | Files | Nature                                             |
| ---------------------------- | ----- | -------------------------------------------------- |
| Formatting only (Ruff)       | ~180  | Import sorting, quote style, line wrapping         |
| Worklog feature (full stack) | ~80   | New models, views, serializers, stores, components |
| Issue recurrence             | ~30   | Model fields, utility, background task, UI         |
| Time-logged analytics        | ~40   | Annotations across views, chart builder, filters   |
| CI/CD improvements           | 9     | Fork safety, permissions, ShellCheck               |
| Infrastructure               | ~10   | Caddyfile, Docker, env, CLI scripts                |
| Frontend UI components       | ~150  | React components for worklog, recurrence, timeline |

---

## Recommendations

1. **FINDING-001:** Verify that using `all_objects` in the creator permission check is intentional. Add a code comment if so.
2. **FINDING-002:** Confirm that exposing `time_logged` on public deploy boards is desired product behavior.
3. **Housekeeping:** `test_worklog_api.py` at the repository root should be moved to `apps/api/plane/tests/` or `e2e/tests/` for consistency.

---

## Conclusion

The staging → preview diff is **safe to merge**. The codebase demonstrates strong security practices:

- Consistent use of `@allow_permission` decorator with role-based access control
- `ProjectBaseModel` scoping ensures workspace/project isolation
- DRF serializers with explicit `read_only_fields` prevent mass assignment
- Django ORM used exclusively (no raw SQL)
- Input validation at API boundaries with proper error handling
- Background tasks use database locks and atomic transactions

The two findings are informational/minor and do not represent exploitable vulnerabilities. Both can be addressed in follow-up work if needed.

---

_Review artifacts:_

- Task list: `tmp/security-review/task-list.md`
- File tracker: `tmp/security-review/file-tracker.md`
- Draft findings: `tmp/security-review/draft-findings.md`
- Per-file diffs: `tmp/security-review/diffs/` (501 files)
- Full diff: `tmp/security-review/full-diff.patch`
