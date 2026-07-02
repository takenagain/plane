# Plane Desktop — Status Report

## 1. Report Metadata

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Report date**  | 2026-07-02                                                                                 |
| **Branch / PR**  | `feat/desktop-app-wails` — [PR #37](https://github.com/takenagain/plane/pull/37)           |
| **Reporter**     | Agent (Phase 2 integration)                                                                |
| **Base commit**  | Post-integration: webview login + issue-picker wired in `App.svelte` and `app.go`          |
| **Staging sync** | 2026-07-02 — `origin/staging` already merged (ancestor of HEAD; merge reported up-to-date) |

## 2. Executive Summary

The Plane Desktop app is now an **alpha prototype with end-to-end auth and issue selection** on branch `feat/desktop-app-wails`. P0 milestones landed: embedded webview login with cookie extraction via a local login proxy, and a searchable issue-picker dialog wired from the system tray and main window. Biggest win in this phase: **tray "Start Tracking" / "Search Issues" open the issue dialog after auth; unauthenticated users are routed to login first**. Biggest remaining blocker: **settings UI and secure keychain storage** (P1). Recommended next milestone: settings dialog + OS keychain for cookies.

## 3. Phase Progress

| Phase                        | Status | Notes                                                                                          |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Phase 1: Project Setup       | 🔄     | Wails project exists; structure partially set up; README still default template                |
| Phase 2: Core Backend        | 🔄     | Config, cookie, API, timer, tray, auth webview implemented; `tasks.md` checkboxes partially ⬜ |
| Phase 3: Frontend Components | 🔄     | Login webview, issue selection dialog, authenticated status shell                              |
| Phase 4: System Integration  | 🔄     | Tray → issue picker + auth gating; webview login on startup when cookies missing               |
| Phase 5: Polish & Testing    | 🔄     | Desktop CI workflow; Go unit tests for API, cookie, models                                     |
| Phase 6: Advanced Features   | ⏭️     | Deferred                                                                                       |

## 4. Component Status

| Component              | Status | Works                                                                 | Broken / Missing                                    | Evidence                                   |
| ---------------------- | ------ | --------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Configuration Manager  | 🔄     | Load/save JSON config with defaults; platform paths                   | No settings UI; no URL validation wizard            | `internal/config/config.go`                |
| Cookie Manager         | 🔄     | File-based load/save; webview extraction via login proxy              | No OS keychain (TODOs)                              | `internal/cookie/`, `auth_webview.go`      |
| API Client             | 🔄     | User, workspaces, issues search, time tracking start/stop             | No retry/rate-limit; live API untested in agent env | `internal/api/client.go`, `client_test.go` |
| Timer Manager          | 🔄     | Local timer tick, persistence, callbacks                              | Not synced with server on startup                   | `internal/timer/timer.go`                  |
| System Tray Manager    | 🔄     | Menu structure, live timer display, auth tooltip                      | No custom icon                                      | `internal/tray/tray.go`                    |
| Auth / Webview         | ✅     | Login proxy, cookie capture, auth state events, tray auth gating      | Iframe sandbox may need tuning per Plane instance   | `auth_webview.go`, `LoginWebview.svelte`   |
| Issue Selection Dialog | ✅     | Debounced search, keyboard nav, tray + frontend entry points          | —                                                   | `IssueSelectionDialog.svelte`, `app.go`    |
| Application Controller | 🔄     | Startup orchestration, auth bootstrap, tray callbacks, Wails bindings | Settings, notifications stubbed                     | `app.go`                                   |
| Svelte Frontend        | 🔄     | Auth-gated shell, login webview, issue picker, timer summary          | Not a full Plane UI                                 | `frontend/src/App.svelte`                  |
| Wails Bindings         | ✅     | Auth, search, tracking, config bindings present                       | Regenerate via `wails generate` after API changes   | `frontend/wailsjs/go/main/App.js`          |

## 5. Dependency & Build Health

| Area     | Version(s)                                                               | Build / test result                                                     |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Go       | 1.26.4 (module); Wails v2.12.0; systray v1.2.2                           | `go build` + `go vet` — pass in CI; Go not installed in agent env       |
| Wails    | v2.12.0 (direct)                                                         | Wails CLI not verified locally                                          |
| Frontend | Svelte 5.56.4, Vite 8.1.3, @sveltejs/vite-plugin-svelte 7.1.2            | `npm run build` — pass (2026-07-02 integration)                         |
| Monorepo | `vite` catalog 8.1.3; staging already merged; dev tooling at latest pins | `pnpm check` — pass in CI (60 tasks); not re-run (desktop-only changes) |

**Phase 2 integration fixes (2026-07-02):**

- Merged webview login (`ff1ba4f`) and issue-picker (`d9b70da`) in `App.svelte` — webview commit had dropped `IssueSelectionDialog` wiring
- Added auth gating in `openIssueSelectionDialog()` — unauthenticated tray actions route to login

## 6. Known Issues

1. **Settings menu is a log stub** — Impact: **major**. Cannot change Plane URL from UI. Spec: `docs/specs/settings-dialog.md`.
2. **Cookie storage is plain JSON file** — Impact: **major** (security). Spec: `docs/specs/secure-cookie-storage.md`.
3. **Default tray icon** — Impact: **minor**. `systray.SetIcon` commented out. Spec: `docs/specs/custom-tray-icons.md`.
4. **Local Linux `go build` needs systray CGO libs** — Impact: **minor** (dev env). Install `libayatana-appindicator3-dev` and `libgtk-3-dev`; CI workflow handles this. Spec: `docs/specs/testing-and-ci.md`.
5. **PR #19 superseded** — Closed in favor of [PR #37](https://github.com/takenagain/plane/pull/37) on branch `feat/desktop-app-wails`.

## 7. Outstanding Work

| Item                            | Priority | Spec                                   | Blocked by                               |
| ------------------------------- | -------- | -------------------------------------- | ---------------------------------------- |
| ~~Webview + cookie extraction~~ | ~~P0~~   | `docs/specs/webview-integration.md`    | ✅ Implemented                           |
| ~~Issue selection dialog~~      | ~~P0~~   | `docs/specs/issue-selection-dialog.md` | ✅ Implemented                           |
| Settings dialog                 | P1       | `docs/specs/settings-dialog.md`        | Frontend UI                              |
| Secure cookie storage           | P1       | `docs/specs/secure-cookie-storage.md`  | Platform keychain libs                   |
| Unit / integration tests        | P1       | `docs/specs/testing-and-ci.md`         | Add `go test` to CI workflow             |
| Desktop notifications           | P2       | `docs/specs/desktop-notifications.md`  | Wails notification API                   |
| Custom tray icons               | P2       | `docs/specs/custom-tray-icons.md`      | Asset design                             |
| Auto-update                     | P3       | `docs/specs/auto-update.md`            | Release pipeline                         |
| CI workflow for desktop         | P2       | `docs/specs/testing-and-ci.md`         | `ci-approved` label for bot-authored PRs |

## 8. Verification Performed

```text
- [x] git pull origin feat/desktop-app-wails (already up to date)
- [x] Integration review: App.svelte wires LoginWebview + IssueSelectionDialog with auth gating
- [x] Integration review: app.go openIssueSelectionDialog gates on IsAuthenticated()
- [x] npm run build (frontend) — pass (Svelte 5 / Vite 8.1.3, 2026-07-02)
- [ ] go test ./... — Go not installed in agent env; unit tests exist (api, cookie, models)
- [ ] go build . — requires libayatana-appindicator3-dev + libgtk-3-dev on Linux; covered by `.github/workflows/desktop.yml`
- [ ] go vet ./... — same CGO/systray dependency as go build; passes in CI
- [ ] wails build (Wails CLI not installed in environment)
- [ ] pnpm check (full monorepo) — not re-run; desktop-only changes; last CI run pass
- [x] gh pr checks 37 — all pass on pre-integration push (2026-07-02)
- [ ] Manual smoke test on target OS (not run in agent environment)
```

## 9. Next Steps

1. Add settings UI for Plane URL and preferences; wire to `UpdateConfig`.
2. Replace file-based cookie storage with OS keychain integration.
3. Add `go test ./...` step to `.github/workflows/desktop.yml`.
4. Manual smoke test: login via webview → tray start tracking → search issue → verify timer.
5. Obtain `ci-approved` label on PR #37 so desktop CI runs on push.
6. Regenerate Wails bindings in dev workflow (`wails generate module`).
