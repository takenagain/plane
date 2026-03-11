#!/usr/bin/env bash

# simple harness for testing community-local-image-rollout.sh functions
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export SCRIPT_DIR
source "${SCRIPT_DIR}/community-local-image-rollout.sh"

# track results
passed=0
failed=0

run_test() {
  local name="$1"
  shift
  echo "[TEST] $name..."
  if "$@"; then
    echo "  OK"
    passed=$((passed + 1))
  else
    echo "  FAILED" >&2
    failed=$((failed + 1))
  fi
}

run_test "dry-run exits before doing work" bash -c '
  source "$SCRIPT_DIR/community-local-image-rollout.sh"
  tmpd="$(mktemp -d)"
  tmpf="$tmpd/docker-compose.yml"
  cat >"$tmpf" <<YAML
services:
  web:
    image: artifacts.plane.so/makeplane/plane-frontend:
      ${APP_RELEASE:-stable}
YAML
  ASSUME_YES="true"
  main --deploy-dir "$tmpd" --dry-run -y
'

run_test "rewrite_compose_images rewrites image path and forces target tag" bash -c '
  source "$SCRIPT_DIR/community-local-image-rollout.sh"
  tmp="$(mktemp)"
  cat >"$tmp" <<YAML
services:
  web:
    image: artifacts.plane.so/makeplane/plane-frontend:${APP_RELEASE:-stable}
  api:
    image: localplane/plane-backend:v1.2.1
  proxy:
    image: plane-proxy:sha-old
YAML
  DEPLOY_COMPOSE_FILE="$tmp"
  IMAGE_PREFIX="ghcr.io/takenagain/plane"
  IMAGE_TAG="feature-time-tracking"
  NOW_UTC="20260101-000000"
  rewrite_compose_images
  grep -q "ghcr.io/takenagain/plane/plane-frontend:feature-time-tracking" "$tmp" && \
    grep -q "ghcr.io/takenagain/plane/plane-backend:feature-time-tracking" "$tmp" && \
    grep -q "ghcr.io/takenagain/plane/plane-proxy:feature-time-tracking" "$tmp"
'

run_test "rewrite_compose_images creates backup file" bash -c '
  source "$SCRIPT_DIR/community-local-image-rollout.sh"
  tmp="$(mktemp)"
  cat >"$tmp" <<YAML
services:
  admin:
    image: artifacts.plane.so/makeplane/plane-admin:${APP_RELEASE:-stable}
YAML
  DEPLOY_COMPOSE_FILE="$tmp"
  IMAGE_PREFIX="ghcr.io/takenagain/plane"
  IMAGE_TAG="feature-time-tracking"
  NOW_UTC="20260101-000000"
  rewrite_compose_images
  [[ -f "$tmp.bak.20260101-000000" ]]
'

echo
if [[ $failed -gt 0 ]]; then
  echo "Tests failed: $failed" >&2
  exit 1
else
  echo "All $passed tests passed."
  exit 0
fi
