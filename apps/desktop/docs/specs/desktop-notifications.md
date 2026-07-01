# Spec: Desktop Notifications

## Status

| Field        | Value |
| ------------ | ----- |
| Priority     | P2    |
| Phase        | 4.5   |
| Requirements | FR6.3 |

## Problem

Time tracking start/stop and errors only log to stdout. TODOs in `app.go` reference notifications that were never implemented.

## Goals

Native notifications for:

- Time tracking started (issue title)
- Time tracking stopped (duration summary)
- API errors (auth failure, network)
- Long-running session alert (configurable threshold)

## Design

Use Wails runtime notification API:

```go
import "github.com/wailsapp/wails/v2/pkg/runtime"

runtime.EventsEmit(ctx, "notification", payload) // optional bridge to frontend
// or platform notification where supported
```

Centralize in `internal/notify/notify.go`:

```go
func Show(title, message string, urgency Urgency) error
```

Respect `config.NotificationSound` and future DND setting.

### Hook Points

| Event          | Location                               |
| -------------- | -------------------------------------- |
| Start tracking | `handleStartTracking`, `StartTracking` |
| Stop tracking  | `handleStopTracking`, `StopTracking`   |
| API error      | `api.Client.doRequest` wrapper         |
| Long session   | timer tick when elapsed > threshold    |

## Acceptance Criteria

- [ ] User sees OS notification on start/stop
- [ ] Errors surface as notifications when tray action fails
- [ ] Long session alert fires once per session until dismissed

## References

- `app.go` TODO comments lines 157, 161, 182, 192
- `requirements.md` FR6.3
