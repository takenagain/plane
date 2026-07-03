#!/usr/bin/env bash
# Local parity wrapper for .github/workflows/desktop-release-artifacts.yml
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

WAILS_VERSION="${WAILS_VERSION:-v2.12.0}"
PLATFORM="${1:-linux-amd64}"
CLEAN="${CLEAN:-true}"

usage() {
  cat <<'EOF'
Usage: build-release.sh [platform]

Platforms:
  linux-amd64       Linux amd64 binary (default)
  windows-amd64     Windows amd64 exe + NSIS installer (run on Windows)
  macos-universal   macOS universal .app bundle (run on macOS)

Environment:
  WAILS_VERSION     Wails CLI tag (default: v2.12.0)
  CLEAN             Pass -clean to wails build when true (default: true)
  VERSION           Written into dist/<artifact>/VERSION after build

Linux prerequisites:
  libgtk-3-dev libayatana-appindicator3-dev
  libwebkit2gtk-4.0-dev (Ubuntu 22.04) or libwebkit2gtk-4.1-dev (Ubuntu 24.04)

Windows prerequisites:
  NSIS (makensis on PATH) for -nsis installer output

Examples:
  ./build-release.sh linux-amd64
  PLATFORM=windows-amd64 ./build-release.sh
EOF
}

install_wails() {
  if ! command -v wails >/dev/null 2>&1; then
    go install "github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}"
  fi
}

install_linux_deps() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Install GTK/WebKit/systray dev packages for your distro before building." >&2
    return 0
  fi
  sudo apt-get update
  sudo apt-get install -y \
    build-essential \
    pkg-config \
    libgtk-3-dev \
    libayatana-appindicator3-dev
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [[ "${VERSION_ID:-}" == "24.04" ]]; then
      sudo apt-get install -y libwebkit2gtk-4.1-dev
      export WAILS_BUILD_TAGS="${WAILS_BUILD_TAGS:-webkit2_41}"
    else
      sudo apt-get install -y libwebkit2gtk-4.0-dev
    fi
  fi
}

stage_artifact() {
  local artifact_name="$1"
  local staging="dist/${artifact_name}"
  mkdir -p "${staging}"
  echo "${VERSION:-local}" > "${staging}/VERSION"
  echo "${staging}"
}

build_linux_amd64() {
  install_linux_deps
  install_wails
  local args=(-platform linux/amd64 -o plane-desktop)
  [[ "${CLEAN}" == "true" ]] && args=(-clean "${args[@]}")
  [[ -n "${WAILS_BUILD_TAGS:-}" ]] && args+=(-tags "${WAILS_BUILD_TAGS}")
  wails build "${args[@]}"
  local staging
  staging="$(stage_artifact plane-desktop-linux-amd64)"
  cp build/bin/plane-desktop "${staging}/"
  chmod +x "${staging}/plane-desktop"
  cat > "${staging}/BUILD-NOTES.txt" <<'EOF'
Wails v2 emits a native Linux binary only (no AppImage). Use CI workflow
desktop-release-artifacts.yml for cross-platform release builds.
EOF
  echo "Staged ${staging}"
}

build_windows_amd64() {
  if [[ "$(uname -s)" != "MINGW"* && "$(uname -s)" != "MSYS"* && "$(uname -s)" != "CYGWIN"* ]]; then
    echo "windows-amd64 builds must run on Windows (or use GitHub Actions)." >&2
    exit 1
  fi
  install_wails
  local args=(-platform windows/amd64 -o plane-desktop -webview2 embed -nsis)
  [[ "${CLEAN}" == "true" ]] && args=(-clean "${args[@]}")
  wails build "${args[@]}"
  local staging
  staging="$(stage_artifact plane-desktop-windows-amd64)"
  cp build/bin/plane-desktop.exe "${staging}/"
  if [[ -f build/bin/plane-desktop-amd64-installer.exe ]]; then
    cp build/bin/plane-desktop-amd64-installer.exe "${staging}/"
  fi
  echo "Staged ${staging}"
}

build_macos_universal() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "macos-universal builds must run on macOS (or use GitHub Actions)." >&2
    exit 1
  fi
  install_wails
  local args=(-platform darwin/universal -o plane-desktop)
  [[ "${CLEAN}" == "true" ]] && args=(-clean "${args[@]}")
  wails build "${args[@]}"
  local staging
  staging="$(stage_artifact plane-desktop-macos-universal)"
  ditto -c -k --keepParent build/bin/plane-desktop.app "${staging}/plane-desktop.app.zip"
  echo "Staged ${staging}"
}

case "${PLATFORM}" in
  linux-amd64|linux)
    build_linux_amd64
    ;;
  windows-amd64|windows)
    build_windows_amd64
    ;;
  macos-universal|macos|darwin-universal)
    build_macos_universal
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown platform: ${PLATFORM}" >&2
    usage
    exit 1
    ;;
esac
