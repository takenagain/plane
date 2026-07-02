# Plane Desktop — Status Report

## 1. Report Metadata

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Report date**  | 2026-07-02                                                                                 |
| **Branch / PR**  | `feat/desktop-app-wails` — [PR #37](https://github.com/takenagain/plane/pull/37)           |
| **Reporter**     | Agent (PR revival checklist)                                                               |
| **Base commit**  | Post-revival dependency bump and staging verification                                      |
| **Staging sync** | 2026-07-02 — `origin/staging` already merged (ancestor of HEAD; merge reported up-to-date) |

## 2. Executive Summary

The Plane Desktop app remains an **early backend prototype with a minimal frontend shell** on a clean revival branch targeting `staging`. Core Go packages for configuration, cookies, API access, timer state, and system tray exist; user-facing flows (login, issue picker, settings) are still stubbed. Biggest win in this revival: **dependency refresh (Go 1.26.4, Vite 8, desktop CI workflow)** and verified monorepo `pnpm check`. Biggest blocker: **no webview login** — authentication still requires manually provisioned cookies. Recommended next milestone: webview integration + issue selection dialog so tray-based time tracking is usable end-to-end.

## 3. Phase Progress

| Phase                        | Status | Notes                                                                                              |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Phase 1: Project Setup       | 🔄     | Wails project exists; structure partially set up; README still default template                    |
| Phase 2: Core Backend        | 🔄     | Config, cookie, API, timer, tray packages implemented; many task checkboxes in `tasks.md` still ⬜ |
| Phase 3: Frontend Components | ⬜     | Default Wails Svelte template replaced with minimal status UI only                                 |
| Phase 4: System Integration  | ⬜     | No webview, notifications, or settings UI                                                          |
| Phase 5: Polish & Testing    | 🔄     | Desktop CI workflow added; no Go unit tests yet                                                    |
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

| Area     | Version(s)                                                               | Build / test result                                                     |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Go       | 1.26.4 (module); Wails v2.12.0; systray v1.2.2                           | `go build` — blocked locally without systray CGO libs; CI installs them |
| Wails    | v2.12.0 (direct)                                                         | Wails CLI not verified locally                                          |
| Frontend | Svelte 5.56.4, Vite 8.1.3, @sveltejs/vite-plugin-svelte 7.1.2            | `npm run build` — pass                                                  |
| Monorepo | `vite` catalog 8.1.3; staging already merged; dev tooling at latest pins | `pnpm check` — pass (60 tasks)                                          |

**Updates applied in this revival (2026-07-02):**

- Go module: `go 1.24.4` → `1.26.4`; transitive deps upgraded (`golang.org/x/*`, `labstack/echo`, OpenTelemetry, etc.)
- Desktop frontend: Vite 6.3.5 → 8.1.3, `@sveltejs/vite-plugin-svelte` 5.1.1 → 7.1.2 (Svelte 5.56.4 unchanged — already latest)
- Monorepo catalog: `vite` 8.1.2 → 8.1.3 (other catalog pins already at latest stable as of bump time)
- Removed stale `replace` comment from `go.mod`

**Monorepo-wide major bumps deferred:** Full catalog refresh (React ecosystem, TipTap, Storybook, etc.) is out of scope for this PR revival; `pnpm check` passes on current pins. Revisit in a dedicated dependency PR if needed.

## 6. Known Issues

1. **No webview / login flow** — Impact: **blocker** for normal users. Cookies must be placed manually. Workaround: none for production. Spec: `docs/specs/webview-integration.md`.
2. **Start tracking from tray does nothing useful** — Impact: **major**. `handleStartTracking(nil)` logs and returns. Spec: `docs/specs/issue-selection-dialog.md`.
3. **Settings menu is a log stub** — Impact: **major**. Cannot change Plane URL from UI. Spec: `docs/specs/settings-dialog.md`.
4. **Cookie storage is plain JSON file** — Impact: **major** (security). Spec: `docs/specs/secure-cookie-storage.md`.
5. **Default tray icon** — Impact: **minor**. `systray.SetIcon` commented out. Spec: `docs/specs/custom-tray-icons.md`.
6. **Local Linux `go build` needs systray CGO libs** — Impact: **minor** (dev env). Install `libayatana-appindicator3-dev` and `libgtk-3-dev`; CI workflow handles this. Spec: `docs/specs/testing-and-ci.md`.
7. **PR #19 superseded** — Closed in favor of [PR #37](https://github.com/takenagain/plane/pull/37) on branch `feat/desktop-app-wails`.

## 7. Outstanding Work

| Item                        | Priority | Spec                                   | Blocked by                               |
| --------------------------- | -------- | -------------------------------------- | ---------------------------------------- |
| Webview + cookie extraction | P0       | `docs/specs/webview-integration.md`    | Wails webview API research               |
| Issue selection dialog      | P0       | `docs/specs/issue-selection-dialog.md` | Auth + API                               |
| Settings dialog             | P1       | `docs/specs/settings-dialog.md`        | Frontend UI                              |
| Secure cookie storage       | P1       | `docs/specs/secure-cookie-storage.md`  | Platform keychain libs                   |
| Unit / integration tests    | P1       | `docs/specs/testing-and-ci.md`         | Test harness setup                       |
| Desktop notifications       | P2       | `docs/specs/desktop-notifications.md`  | Wails notification API                   |
| Custom tray icons           | P2       | `docs/specs/custom-tray-icons.md`      | Asset design                             |
| Auto-update                 | P3       | `docs/specs/auto-update.md`            | Release pipeline                         |
| CI workflow for desktop     | P2       | `docs/specs/testing-and-ci.md`         | `ci-approved` label for bot-authored PRs |

## 8. Verification Performed

```text
- [x] git merge origin/staging (already up to date — staging is ancestor of HEAD)
- [x] npm run build (frontend) — pass (Svelte 5 / Vite 8.1.3)
- [ ] go build . — requires libayatana-appindicator3-dev + libgtk-3-dev on Linux (sudo blocked in agent env); covered by `.github/workflows/desktop.yml`
- [ ] go vet ./... — same CGO/systray dependency as go build
- [ ] go test ./... (no tests exist yet)
- [ ] wails build (Wails CLI not installed in environment)
- [x] pnpm check (full monorepo) — pass (60 tasks, 2026-07-02)
- [ ] Manual smoke test on target OS (not run in agent environment)
```

## 9. Next Steps

1. Implement embedded webview loading configured Plane URL and extract session cookies on login.
2. Build issue search/selection modal callable from tray and frontend.
3. Add settings UI for Plane URL and preferences; wire to `UpdateConfig`.
4. Replace file-based cookie storage with OS keychain integration.
5. Add Go unit tests for config, timer, and API client (mocked HTTP) per `docs/specs/testing-and-ci.md`.
6. Obtain `ci-approved` label on PR #37 so desktop CI runs on push.
7. Regenerate Wails bindings in dev workflow (`wails generate module`).
