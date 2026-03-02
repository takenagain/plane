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
  local name="$1"; shift
  echo "[TEST] $name..."
  if "$@"; then
    echo "  OK"
    passed=$((passed+1))
  else
    echo "  FAILED" >&2
    failed=$((failed+1))
  fi
}

# tests
run_test "validate rejects bad tag" bash -c 'source "$SCRIPT_DIR/community-local-image-rollout.sh"; IMAGE_TAG="bad/tag"; IMAGE_NAMESPACE="foo"; if (validate_image_vars); then exit 1; else exit 0; fi'
run_test "validate rejects bad namespace" bash -c 'source "$SCRIPT_DIR/community-local-image-rollout.sh"; IMAGE_TAG="good"; IMAGE_NAMESPACE="Bad*"; if (validate_image_vars); then exit 1; else exit 0; fi'
run_test "validate accepts good names" bash -c 'source "$SCRIPT_DIR/community-local-image-rollout.sh"; IMAGE_TAG="foo-1_2"; IMAGE_NAMESPACE="bar"; (validate_image_vars)'

run_test "dry-run exits before doing work" bash -c '
  source "$SCRIPT_DIR/community-local-image-rollout.sh"; DRY_RUN="true"; 
  tmpf="$(mktemp)"; touch "$tmpf"; DEPLOY_DIR="/tmp"; DEPLOY_COMPOSE_FILE="$tmpf"; 
  SOURCE_REPO_URL="u"; SOURCE_BRANCH="b"; CLONE_DIR="/tmp/zzz"; IMAGE_NAMESPACE="n"; IMAGE_TAG="t"; RUNTIME="auto"; ASSUME_YES="true"; 
  # main should exit 0 without touching directories
  main --deploy-dir /tmp -y
'

run_test "rewrite_compose_images updates tags" bash -c '
  source "$SCRIPT_DIR/community-local-image-rollout.sh"; tmp="$(mktemp)"; cat >"$tmp" <<EOF
services:
  web:
    image: plane-frontend:latest
  api:
    image: foo/plane-backend:old
EOF
  DEPLOY_COMPOSE_FILE="$tmp"; IMAGE_NAMESPACE="ns"; IMAGE_TAG="v1"; NOW_UTC="${NOW_UTC}";
  rewrite_compose_images
  grep -q "ns/plane-frontend:v1" "$tmp" && grep -q "ns/plane-backend:v1" "$tmp"
'

# summary

echo
if [[ $failed -gt 0 ]]; then
  echo "Tests failed: $failed" >&2
  exit 1
else
  echo "All $passed tests passed."
  exit 0
fi
