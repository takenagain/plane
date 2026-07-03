# Plane Desktop — Status Report Specification

This document defines how to write periodic status reports for the Plane Desktop application. Follow this format when updating `status-report.md` or reporting progress in pull requests.

## Purpose

Status reports give stakeholders an honest snapshot of implementation progress against `requirements.md`, `design.md`, and `tasks.md`. Reports must distinguish **implemented**, **partial**, **blocked**, and **not started** work.

## Required Sections

### 1. Report Metadata

| Field            | Description                                         |
| ---------------- | --------------------------------------------------- |
| **Report date**  | ISO 8601 date (YYYY-MM-DD)                          |
| **Branch / PR**  | Branch name and PR URL if applicable                |
| **Reporter**     | Person or agent authoring the report                |
| **Base commit**  | Short SHA of the commit reviewed                    |
| **Staging sync** | Date and result of last merge/rebase from `staging` |

### 2. Executive Summary

2–4 sentences covering:

- Overall readiness (e.g., prototype, alpha, beta)
- Biggest win since last report
- Biggest blocker or risk
- Recommended next milestone

### 3. Phase Progress

Map progress to phases in `tasks.md`. Use the status legend:

| Symbol | Meaning                |
| ------ | ---------------------- |
| ✅     | Complete and verified  |
| 🔄     | In progress            |
| ⬜     | Not started            |
| ⏸️     | Blocked (state reason) |
| ⏭️     | Deferred               |

Include a table:

| Phase         | Status | Notes      |
| ------------- | ------ | ---------- |
| Phase N: Name | Symbol | Brief note |

### 4. Component Status

For each backend/frontend component in `design.md` §1.2, report:

| Component | Status   | Works                | Broken / Missing | Evidence                                |
| --------- | -------- | -------------------- | ---------------- | --------------------------------------- |
| Name      | ✅/🔄/⬜ | What functions today | Gaps or bugs     | File paths, manual test, or test result |

Minimum components: Configuration Manager, Cookie Manager, API Client, Timer Manager, System Tray Manager, Svelte Frontend, Wails Bindings.

### 5. Dependency & Build Health

| Area     | Version(s)           | Build / test result                     |
| -------- | -------------------- | --------------------------------------- |
| Go       | e.g. 1.24.x          | `go build`, `go test`                   |
| Wails    | e.g. v2.12.0         | `wails build` if available              |
| Frontend | Svelte / Vite pins   | `npm run build` in `frontend/`          |
| Monorepo | staging merge status | `pnpm check` if desktop is in workspace |

Note any version pins, major upgrades applied, and breaking changes fixed.

### 6. Known Issues

Bulleted list. Each item must include:

- **Symptom** — what the user sees
- **Impact** — severity (blocker / major / minor)
- **Workaround** — if any
- **Tracking** — TODO location or spec reference

### 7. Outstanding Work

List items not yet complete, linked to design specs in `docs/specs/` when available:

| Item | Priority | Spec | Blocked by |
| ---- | -------- | ---- | ---------- |

### 8. Verification Performed

Checklist of commands run and outcomes:

```text
- [ ] go build ./...
- [ ] go test ./...
- [ ] npm run build (frontend)
- [ ] wails build (optional; note if CLI unavailable)
- [ ] pnpm check (monorepo)
- [ ] Manual smoke test on target OS
```

### 9. Next Steps

Numbered list of 3–7 concrete tasks for the next iteration, ordered by dependency.

## Writing Rules

1. **Be honest** — do not mark tasks complete in `tasks.md` unless verified in code or tests.
2. **Cite evidence** — reference file paths (e.g. `internal/api/client.go`) not vague claims.
3. **Align with PR description** — if the PR body overstates progress, the status report must correct it.
4. **Do not translate product terms** — keep "Plane", "workspace", "issue", "worklog" in English.
5. **Update frequency** — at minimum on each PR revival, major dependency bump, or phase completion.

## Related Documents

- `requirements.md` — functional requirements (FR1–FR6)
- `design.md` — architecture and component design
- `tasks.md` — detailed task checklist
- `docs/specs/` — software design specs for outstanding features
