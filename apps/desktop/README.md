# Plane Desktop

Cross-platform desktop client for Plane, built with [Wails](https://wails.io/) (Go backend + Svelte frontend).

## Documentation

- [Requirements](docs/requirements.md)
- [Design](docs/design.md)
- [Tasks](docs/tasks.md)
- [Status report spec](docs/status-report-spec.md)
- [Current status report](docs/status-report.md)
- [Feature specs](docs/specs/)

## Prerequisites

- Go 1.24+
- Node.js 20+ (for frontend build)
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0`
- Linux: `libayatana-appindicator3-dev` and `libgtk-3-dev` for system tray

## Development

```bash
cd apps/desktop
wails dev
```

## Building

```bash
cd apps/desktop/frontend && npm install && npm run build
cd .. && go build .
# or
wails build
```
