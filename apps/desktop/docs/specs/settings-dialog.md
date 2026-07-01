# Spec: Settings Dialog

## Status

| Field        | Value     |
| ------------ | --------- |
| Priority     | P1        |
| Phase        | 3.x / 4.x |
| Requirements | FR1, US1  |

## Problem

`handleSettings()` logs "Settings not yet implemented". Users cannot change Plane URL or preferences without editing config JSON on disk.

## Goals

Settings UI for:

| Field                        | Config key                   | Control               |
| ---------------------------- | ---------------------------- | --------------------- |
| Plane instance URL           | `plane_url`                  | Text input + validate |
| Start minimized              | `start_minimized`            | Checkbox              |
| Notification sound           | `notification_sound`         | Checkbox              |
| Long session alert (minutes) | `long_session_alert_minutes` | Number (0 = off)      |
| Sync interval                | `sync_interval_minutes`      | Number                |

## Design

### Component

`frontend/src/components/SettingsDialog.svelte`:

- Load via `GetConfig()` on open
- Save via `UpdateConfig(cfg)` on submit
- URL validation: HTTPS required, reachable HEAD/GET probe optional

### Tray / Menu

- Tray "Settings" emits event or navigates main window to settings route
- `handleSettings()` calls `runtime.WindowShow` + event

### Post-Save Behavior

- If `plane_url` changed: clear cookies, prompt re-login via webview spec
- Recreate API client with new base URL

## Acceptance Criteria

- [ ] All config fields editable from UI
- [ ] Invalid URL shows inline error
- [ ] Changes persist across restart
- [ ] Plane URL change triggers re-authentication flow

## References

- `internal/config/config.go`
- `app.go` `GetConfig`, `UpdateConfig`, `handleSettings`
