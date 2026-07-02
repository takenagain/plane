# Spec: Testing & CI

## Status

| Field        | Value                        |
| ------------ | ---------------------------- |
| Priority     | P1 (tests), P2 (CI gate)     |
| Phase        | 5.1–5.3, 5.5                 |
| Requirements | NFR quality, maintainability |

## Problem

The desktop app has no automated tests and no verified CI pipeline on the revival PR. Backend logic (config, timer, API client) is untested; Linux builds depend on CGO systray libraries that are easy to miss in local dev environments.

## Goals

1. Add Go unit tests for pure-logic packages with mocked HTTP where needed.
2. Run frontend production build in CI on every desktop PR.
3. Run `go build` and `go vet` on Linux with systray dependencies installed.
4. Document local dev prerequisites for Linux builds.

## Non-Goals

- End-to-end UI automation (Playwright/Cypress) in v1
- Cross-platform matrix (macOS/Windows) in initial CI job
- `wails build` producing signed installers (deferred to release pipeline)

## Design

### Test layers

| Layer | Scope                                                          | Tooling                     |
| ----- | -------------------------------------------------------------- | --------------------------- |
| Unit  | `internal/config`, `internal/timer`, `internal/api` (httptest) | Go `testing`                |
| Build | Frontend bundle, Go compile                                    | `npm run build`, `go build` |
| Vet   | Static analysis                                                | `go vet ./...`              |

### Packages to test first

1. **config** — defaults, load/save round-trip, path helpers
2. **timer** — start/stop, tick callbacks, persistence
3. **api** — request shaping, error handling with `httptest.Server`

Packages depending on systray CGO (`internal/tray`) and Wails runtime (`app.go`) are integration-tested manually until a harness exists.

### CI workflow

File: `.github/workflows/desktop.yml`

Triggers on PRs to `staging`/`preview` when `apps/desktop/**` changes.

Jobs:

1. **authorize** — PR authorization gate (requires `ci-approved` label for bot PRs)
2. **build** — Ubuntu runner:
   - `actions/setup-go` from `apps/desktop/go.mod`
   - `apt-get install libayatana-appindicator3-dev libgtk-3-dev`
   - `npm ci && npm run build` in `apps/desktop/frontend`
   - `go build -v .` and `go vet ./...` in `apps/desktop`

### Local Linux prerequisites

```bash
sudo apt-get install -y libayatana-appindicator3-dev libgtk-3-dev
export PATH=~/sdk/go/bin:$PATH   # or system Go matching go.mod
cd apps/desktop && go build . && go vet ./...
cd frontend && npm ci && npm run build
```

## Acceptance Criteria

- [ ] `go test ./...` passes with ≥1 test per config, timer, api package
- [ ] `.github/workflows/desktop.yml` green on PR #37 after `ci-approved` label
- [ ] `status-report.md` verification section reflects CI results
- [ ] README or `docs/` mentions Linux systray build deps

## References

- `tasks.md` Phase 5
- `design.md` §8 (testing strategy)
- `.github/workflows/desktop.yml`
