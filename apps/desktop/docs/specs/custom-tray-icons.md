# Spec: Custom Tray Icons

## Status

| Field        | Value     |
| ------------ | --------- |
| Priority     | P2        |
| Phase        | 2.5 / 5.x |
| Requirements | FR6.4     |

## Problem

`tray.go` has `systray.SetIcon` commented out with `TODO: Load actual icon data`. Tray uses default/empty icon.

## Goals

1. Plane-branded tray icons for idle and tracking states
2. Platform-appropriate sizes (16×16, 22×22, 32×32)
3. Optional template icon on macOS menu bar

## Design

### Assets

```
apps/desktop/build/
├── appicon.png          # Wails app icon (exists in template)
├── tray/
│   ├── tray-idle.png
│   ├── tray-tracking.png
│   └── tray-idle.ico    # Windows
```

Embed via `//go:embed` in `internal/tray/icons.go`.

### Runtime

```go
func (m *Manager) setIcon(active bool) {
    if active {
        systray.SetIcon(trackingIcon)
    } else {
        systray.SetIcon(idleIcon)
    }
}
```

Call from `onTimerTick` when state changes.

## Acceptance Criteria

- [ ] Visible branded icon on Linux system tray
- [ ] Distinct icon when tracking active
- [ ] Icons included in `wails build` output

## References

- `internal/tray/tray.go` line 66–67
- `design.md` UI/UX section
