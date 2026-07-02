#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -x "$ROOT/plane-desktop" ]]; then
  echo "Binary not found. Build first:"
  echo "  cd frontend && npm ci && npm run build"
  echo "  # then build plane-desktop (see README or use Docker build with -tags production,webkit2_41)"
  exit 1
fi

export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# getlantern/systray conflicts with Wails' GTK loop on Linux (SIGABRT). Tray is off
# unless explicitly enabled. Login and the main window work without it.
unset PLANE_DESKTOP_ENABLE_TRAY

exec "$ROOT/plane-desktop" "$@"
