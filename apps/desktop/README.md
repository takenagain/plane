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
- Linux: GTK 3, Ayatana AppIndicator, and WebKitGTK 4.0 or 4.1 development files
  (`libgtk-3-dev`, `libayatana-appindicator3-dev`, and either
  `libwebkit2gtk-4.0-dev` or `libwebkit2gtk-4.1-dev` on Ubuntu)

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
./build-release.sh linux-amd64
```

The release wrapper detects the installed WebKitGTK API. For a direct Wails
build on a system that only provides WebKitGTK 4.1, use:

```bash
wails build -tags webkit2_41
```

Ayatana AppIndicator 0.6 may emit a deprecation warning from the pinned
`getlantern/systray` dependency. The API remains compatible and the warning
does not fail the build.
