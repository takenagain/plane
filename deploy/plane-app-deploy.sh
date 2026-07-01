#!/usr/bin/env bash
# Plane self-hosted deploy helper — copy to ~/plane-selfhost/plane-app/plane
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

compose() {
  docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.override.yaml "$@"
}

usage() {
  cat <<'EOF'
Usage: plane <command> [args...]

Commands:
  deploy, update   Pull latest images and recreate containers (default)
  pull             Pull latest images only
  up               Start/recreate containers (pass extra args to compose up)
  down             Stop containers
  ps               List containers
  logs [service]   Tail logs (optional service name)
  *                Any other args are passed to docker compose

Examples:
  plane              # same as: plane deploy
  plane deploy
  plane logs live
  plane exec api python manage.py migrate
EOF
}

cmd="${1:-deploy}"

case "$cmd" in
  -h|--help|help)
    usage
    ;;
  deploy|update|"")
    compose pull
    compose up -d --force-recreate
    ;;
  pull)
    shift
    compose pull "$@"
    ;;
  up|down|ps|logs|exec|restart|stop|start)
    compose "$@"
    ;;
  *)
    compose "$@"
    ;;
esac
