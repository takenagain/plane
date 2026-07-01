# Plane Desktop — Status Report

## 1. Report Metadata

| Field            | Value                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Report date**  | 2026-07-01                                                                            |
| **Branch / PR**  | `claude/create-plane-gui-app` — [PR #19](https://github.com/takenagain/plane/pull/19) |
| **Reporter**     | Agent (PR revival)                                                                    |
| **Base commit**  | Post-merge with `origin/staging`                                                      |
| **Staging sync** | 2026-07-01 — merge succeeded (ort strategy, no conflicts)                             |

## 2. Executive Summary

The Plane Desktop app is an **early backend prototype with a minimal frontend shell**. Core Go packages for configuration, cookies, API access, timer state, and system tray exist and compile, but several user-facing flows are stubbed or non-functional without manual cookie setup. The PR description overstates progress (e.g. "Phase 2 complete"); honest status is **Phase 1 mostly done, Phase 2 partially implemented, Phases 3–5 not started**. Biggest blocker: **no webview login** — authentication requires manually provisioned cookies. Recommended next milestone: webview integration + issue selection dialog so tray-based time tracking is usable end-to-end.

## 3. Phase Progress

| Phase                        | Status | Notes                                                                                              |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Phase 1: Project Setup       | 🔄     | Wails project exists; structure partially set up; README still default template                    |
| Phase 2: Core Backend        | 🔄     | Config, cookie, API, timer, tray packages implemented; many task checkboxes in `tasks.md` still ⬜ |
| Phase 3: Frontend Components | ⬜     | Default Wails Svelte template replaced with minimal status UI only                                 |
| Phase 4: System Integration  | ⬜     | No webview, notifications, or settings UI                                                          |
| Phase 5: Polish & Testing    | ⬜     | No unit tests; no CI for desktop                                                                   |
| Phase 6: Advanced Features   | ⏭️     | Deferred                                                                                           |

## 4. Component Status

| Component              | Status | Works                                                     | Broken / Missing                                           | Evidence                          |
| ---------------------- | ------ | --------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| Configuration Manager  | 🔄     | Load/save JSON config with defaults; platform paths       | No settings UI; no URL validation wizard                   | `internal/config/config.go`       |
| Cookie Manager         | 🔄     | File-based load/save; validity check                      | No webview extraction; no OS keychain (TODOs)              | `internal/cookie/cookie.go`       |
| API Client             | 🔄     | User, workspaces, issues search, time tracking start/stop | Untested against live API; no retry/rate-limit             | `internal/api/client.go`          |
| Timer Manager          | 🔄     | Local timer tick, persistence, callbacks                  | Not synced with server on startup                          | `internal/timer/timer.go`         |
| System Tray Manager    | 🔄     | Menu structure, live timer display                        | No custom icon; start/search open nil handlers             | `internal/tray/tray.go`           |
| Application Controller | 🔄     | Startup orchestration, Wails bindings                     | Settings, notifications, issue picker stubbed              | `app.go`                          |
| Svelte Frontend        | 🔄     | Shows config URL, auth state, timer summary               | Not a full Plane UI; no webview                            | `frontend/src/App.svelte`         |
| Wails Bindings         | 🔄     | Bindings updated for exported Go methods                  | Must be regenerated via `wails generate` after API changes | `frontend/wailsjs/go/main/App.js` |

## 5. Dependency & Build Health

| Area     | Version(s)                                               | Build / test result                         |
| -------- | -------------------------------------------------------- | ------------------------------------------- |
| Go       | 1.24.4 (module); 1.25+ needed for latest transitive `-u` | See §8 — `go build` pending local toolchain |
| Wails    | v2.12.0 (direct)                                         | Wails CLI not verified in CI                |
| Frontend | Svelte 5.56.4, Vite 6.3.5, plugin-svelte 5.1.1           | `npm run build` — see §8                    |
| Monorepo | Merged latest `staging`                                  | `pnpm check` — see §8                       |

**Updates applied in this revival:**

- Go module bumped to `go 1.24.4` (from 1.23.0)
- Desktop frontend: Svelte 3 → 5, Vite 3 → 6 (pinned, no floating ranges)
- Wails bindings aligned with `app.go` exports (removed stale `Greet` template)

## 6. Known Issues

1. **No webview / login flow** — Impact: **blocker** for normal users. Cookies must be placed manually. Workaround: none for production. Spec: `docs/specs/webview-integration.md`.
2. **Start tracking from tray does nothing useful** — Impact: **major**. `handleStartTracking(nil)` logs and returns. Spec: `docs/specs/issue-selection-dialog.md`.
3. **Settings menu is a log stub** — Impact: **major**. Cannot change Plane URL from UI. Spec: `docs/specs/settings-dialog.md`.
4. **Cookie storage is plain JSON file** — Impact: **major** (security). Spec: `docs/specs/secure-cookie-storage.md`.
5. **Default tray icon** — Impact: **minor**. `systray.SetIcon` commented out. Spec: `docs/specs/custom-tray-icons.md`.
6. **PR body vs `tasks.md` mismatch** — Impact: **process**. PR claims Phase 2 complete; task list shows Phase 1 focus. This report supersedes PR claims.

## 7. Outstanding Work

| Item                        | Priority | Spec                                   | Blocked by                   |
| --------------------------- | -------- | -------------------------------------- | ---------------------------- |
| Webview + cookie extraction | P0       | `docs/specs/webview-integration.md`    | Wails webview API research   |
| Issue selection dialog      | P0       | `docs/specs/issue-selection-dialog.md` | Auth + API                   |
| Settings dialog             | P1       | `docs/specs/settings-dialog.md`        | Frontend UI                  |
| Secure cookie storage       | P1       | `docs/specs/secure-cookie-storage.md`  | Platform keychain libs       |
| Desktop notifications       | P2       | `docs/specs/desktop-notifications.md`  | Wails notification API       |
| Custom tray icons           | P2       | `docs/specs/custom-tray-icons.md`      | Asset design                 |
| Auto-update                 | P3       | `docs/specs/auto-update.md`            | Release pipeline             |
| Unit / integration tests    | P1       | `design.md` §8                         | Test harness setup           |
| CI workflow for desktop     | P2       | —                                      | Go + Wails in GitHub Actions |

## 8. Verification Performed

```text
- [x] git merge origin/staging (clean)
- [x] npm run build (frontend) — pass (Svelte 5 / Vite 6)
- [ ] go build . — blocked on Linux: missing `libayatana-appindicator3-dev` for systray CGO
- [ ] go test ./... (no tests exist yet)
- [ ] wails build (Wails CLI not installed in environment)
- [ ] pnpm check — fail: `admin#check:types` TS6307 (pre-existing on staging, unrelated to desktop)
- [ ] Manual smoke test on target OS (not run in agent environment)
```

## 9. Next Steps

1. Implement embedded webview loading configured Plane URL and extract session cookies on login.
2. Build issue search/selection modal callable from tray and frontend.
3. Add settings UI for Plane URL and preferences; wire to `UpdateConfig`.
4. Replace file-based cookie storage with OS keychain integration.
5. Add Go unit tests for config, timer, and API client (mocked HTTP).
6. Add GitHub Actions job: `go test`, frontend build, optional `wails build` on Linux.
7. Regenerate Wails bindings in dev workflow (`wails generate module`).
