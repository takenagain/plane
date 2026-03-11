#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
NOW_UTC=$(date -u +"%Y%m%d-%H%M%S")

DEPLOY_DIR=""
DEPLOY_COMPOSE_FILE=""
RUNTIME="auto"
IMAGE_PREFIX="ghcr.io/takenagain/plane"
IMAGE_TAG="feature-time-tracking"
DRY_RUN="false"
SKIP_BACKUP="false"
ASSUME_YES="false"

COMPOSE_CMD=()
COMPOSE_GLOBAL_ARGS=()
ENGINE_BIN=""

log() {
  printf "%s\n" "$*"
}

warn() {
  printf "WARN: %s\n" "$*" >&2
}

die() {
  local lineno=${BASH_LINENO[0]:-?}
  printf "ERROR [line %s]: %s\n" "${lineno}" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF_USAGE
Usage: ${SCRIPT_NAME} [options]

Rewrites Plane app image references in a deployed docker-compose file to GHCR images,
then refreshes the deployment.

Options:
  --deploy-dir <path>         Deployed Plane directory (or pass compose file path)
  --compose-file <path>       Compose file path (defaults to docker-compose.yml/.yaml in deploy dir)
  --image-prefix <value>      Image prefix to use (default: ghcr.io/takenagain/plane)
  --image-tag <value>         GHCR image tag to apply (default: feature-time-tracking)
  --runtime <auto|podman|docker>
                              Container runtime selection (default: auto)
  --dry-run                   Print plan and exit without making changes
  --skip-backup               Skip backup step (not recommended)
  -y, --yes                   Non-interactive; do not prompt for confirmation
  -h, --help                  Show this help

Examples:
  ${SCRIPT_NAME} --deploy-dir /opt/plane-selfhost/plane-app
  ${SCRIPT_NAME} --deploy-dir /opt/plane-selfhost/plane-app --image-tag preview
  ${SCRIPT_NAME} --deploy-dir /opt/plane-selfhost/plane-app --image-tag sha-356f35d
EOF_USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --deploy-dir)
        DEPLOY_DIR=${2:-}
        shift 2
        ;;
      --compose-file)
        DEPLOY_COMPOSE_FILE=${2:-}
        shift 2
        ;;
      --image-prefix)
        IMAGE_PREFIX=${2:-}
        shift 2
        ;;
      --image-tag)
        IMAGE_TAG=${2:-}
        shift 2
        ;;
      --runtime)
        RUNTIME=${2:-}
        shift 2
        ;;
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      --skip-backup)
        SKIP_BACKUP="true"
        shift
        ;;
      -y | --yes)
        ASSUME_YES="true"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

prompt_for_missing_inputs() {
  if [[ -z "${DEPLOY_DIR}" ]]; then
    read -r -p "Enter deployed Plane path (directory or compose file path): " DEPLOY_DIR
  fi

  [[ -n "${DEPLOY_DIR}" ]] || die "Deployed path is required"

  if [[ -f "${DEPLOY_DIR}" ]]; then
    DEPLOY_COMPOSE_FILE=$(cd "$(dirname "${DEPLOY_DIR}")" && pwd)/$(basename "${DEPLOY_DIR}")
    DEPLOY_DIR=$(cd "$(dirname "${DEPLOY_DIR}")" && pwd)
  else
    DEPLOY_DIR=$(cd "${DEPLOY_DIR}" && pwd)
  fi
}

resolve_deploy_files() {
  if [[ -n "${DEPLOY_COMPOSE_FILE}" ]]; then
    if [[ "${DEPLOY_COMPOSE_FILE}" != /* ]]; then
      DEPLOY_COMPOSE_FILE="${DEPLOY_DIR}/${DEPLOY_COMPOSE_FILE}"
    fi
  else
    if [[ -f "${DEPLOY_DIR}/docker-compose.yml" ]]; then
      DEPLOY_COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
    elif [[ -f "${DEPLOY_DIR}/docker-compose.yaml" ]]; then
      DEPLOY_COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yaml"
    else
      die "No docker-compose.yml or docker-compose.yaml found in ${DEPLOY_DIR}"
    fi
  fi

  [[ -f "${DEPLOY_COMPOSE_FILE}" ]] || die "Compose file does not exist: ${DEPLOY_COMPOSE_FILE}"

  COMPOSE_GLOBAL_ARGS=()
  if [[ -f "${DEPLOY_DIR}/plane.env" ]]; then
    COMPOSE_GLOBAL_ARGS+=(--env-file "${DEPLOY_DIR}/plane.env")
  elif [[ -f "${DEPLOY_DIR}/.env" ]]; then
    COMPOSE_GLOBAL_ARGS+=(--env-file "${DEPLOY_DIR}/.env")
  fi
}

set_compose_command() {
  local runtime="$1"
  case "${runtime}" in
    docker)
      if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
      elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
      else
        die "Docker runtime requested but neither 'docker compose' nor 'docker-compose' is available"
      fi
      ENGINE_BIN="docker"
      ;;
    podman)
      if command -v podman-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(podman-compose)
      elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(podman compose)
      else
        die "Podman runtime requested but neither 'podman-compose' nor 'podman compose' is available"
      fi
      ENGINE_BIN="podman"
      ;;
    *)
      die "Unsupported runtime: ${runtime}"
      ;;
  esac
}

detect_runtime() {
  local project_name
  local docker_count
  local podman_count

  if [[ "${RUNTIME}" == "docker" || "${RUNTIME}" == "podman" ]]; then
    set_compose_command "${RUNTIME}"
    return
  fi

  [[ "${RUNTIME}" == "auto" ]] || die "--runtime must be one of: auto, docker, podman"

  project_name=$(basename "${DEPLOY_DIR}")
  docker_count=0
  podman_count=0

  if command -v docker >/dev/null 2>&1; then
    docker_count=$(docker ps -aq --filter "label=com.docker.compose.project=${project_name}" 2>/dev/null | wc -l | tr -d '[:space:]')
    docker_count=${docker_count:-0}
  fi

  if command -v podman >/dev/null 2>&1; then
    podman_count=$(
      (
        podman ps -aq --filter "label=io.podman.compose.project=${project_name}" 2>/dev/null
        podman ps -aq --filter "label=com.docker.compose.project=${project_name}" 2>/dev/null
      ) | sort -u | sed "/^$/d" | wc -l | tr -d '[:space:]'
    )
    podman_count=${podman_count:-0}
  fi

  if [[ "${docker_count}" -gt 0 ]]; then
    set_compose_command "docker"
  elif [[ "${podman_count}" -gt 0 ]]; then
    set_compose_command "podman"
  elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    set_compose_command "podman"
  elif command -v podman-compose >/dev/null 2>&1; then
    set_compose_command "podman"
  elif command -v docker >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1; then
    set_compose_command "docker"
  else
    die "Could not auto-detect a supported Podman or Docker compose runtime"
  fi

  RUNTIME="${ENGINE_BIN}"
}

compose_in_dir() {
  local work_dir="$1"
  local compose_file="$2"
  shift 2
  (
    cd "${work_dir}"
    "${COMPOSE_CMD[@]}" -f "${compose_file}" "${COMPOSE_GLOBAL_ARGS[@]}" "$@"
  )
}

confirm_plan() {
  if [[ "${ASSUME_YES}" == "true" ]]; then
    return
  fi

  cat <<EOF_PLAN
Plan:
  Runtime:            ${RUNTIME}
  Deploy directory:   ${DEPLOY_DIR}
  Deploy compose:     ${DEPLOY_COMPOSE_FILE}
  Image prefix:       ${IMAGE_PREFIX}
  Image tag:          ${IMAGE_TAG}
  Skip backup:        ${SKIP_BACKUP}
EOF_PLAN
  echo
  read -r -p "Continue with rollout? [y/N]: " confirm
  if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
    die "Aborted by user"
  fi
}

run_backups() {
  local script_path
  local script_name
  local executed_backup="false"
  local backup_files=()

  if [[ "${SKIP_BACKUP}" == "true" ]]; then
    warn "Skipping backup step because --skip-backup was provided"
    return
  fi

  log "Step 1/3: Running backup scripts for deployed instance"

  while IFS= read -r script_path; do
    backup_files+=("${script_path}")
  done < <(find "${DEPLOY_DIR}" -maxdepth 1 -type f \( -name "backup*.sh" -o -name "backup*" \) | sort)

  for script_path in "${backup_files[@]}"; do
    script_name=$(basename "${script_path}")
    if [[ ! -x "${script_path}" && "${script_name}" != *.sh ]]; then
      continue
    fi
    log "Running backup script: ${script_name}"
    (
      cd "${DEPLOY_DIR}"
      bash "./${script_name}"
    )
    executed_backup="true"
  done

  if [[ "${executed_backup}" == "false" ]]; then
    if [[ -f "${DEPLOY_DIR}/setup.sh" ]]; then
      log "No backup* scripts found. Falling back to: setup.sh backup"
      (
        cd "${DEPLOY_DIR}"
        bash ./setup.sh backup
      )
      executed_backup="true"
    elif [[ -f "${DEPLOY_DIR}/install.sh" ]]; then
      log "No backup* scripts found. Falling back to: install.sh backup"
      (
        cd "${DEPLOY_DIR}"
        bash ./install.sh backup
      )
      executed_backup="true"
    fi
  fi

  [[ "${executed_backup}" == "true" ]] || die "No runnable backup method found in ${DEPLOY_DIR}"
}

rewrite_compose_images() {
  local compose_backup
  local tmp_file
  local image_name
  local image_names=(
    plane-frontend
    plane-space
    plane-admin
    plane-live
    plane-backend
    plane-proxy
  )

  log "Step 2/3: Rewriting compose image paths to ${IMAGE_PREFIX} with tag ${IMAGE_TAG}"
  compose_backup="${DEPLOY_COMPOSE_FILE}.bak.${NOW_UTC}"
  cp "${DEPLOY_COMPOSE_FILE}" "${compose_backup}"
  log "Backup created: ${compose_backup}"

  tmp_file=$(mktemp)
  cp "${DEPLOY_COMPOSE_FILE}" "${tmp_file}"

  for image_name in "${image_names[@]}"; do
    log "  - rewriting references to ${image_name}"
    sed -E \
      "s#(^[[:space:]]*image:[[:space:]]*)([^[:space:]]*/)?${image_name}(:[^[:space:]]+)?#\\1${IMAGE_PREFIX}/${image_name}:${IMAGE_TAG}#g" \
      "${tmp_file}" >"${tmp_file}.next"
    mv "${tmp_file}.next" "${tmp_file}"
  done

  cp "${tmp_file}" "${DEPLOY_COMPOSE_FILE}"
  rm -f "${tmp_file}"
}

refresh_deployment() {
  log "Step 3/3: Pulling GHCR images and recreating stack"

  if ! compose_in_dir "${DEPLOY_DIR}" "${DEPLOY_COMPOSE_FILE}" pull --policy always --ignore-pull-failures; then
    warn "Compose pull with --policy/--ignore-pull-failures failed; retrying with plain pull"
    compose_in_dir "${DEPLOY_DIR}" "${DEPLOY_COMPOSE_FILE}" pull || warn "Pull failed; continuing with compose up"
  fi

  compose_in_dir "${DEPLOY_DIR}" "${DEPLOY_COMPOSE_FILE}" up -d --force-recreate --remove-orphans
}

main() {
  parse_args "$@"
  prompt_for_missing_inputs
  resolve_deploy_files

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "DRY RUN: the following actions would be performed."
    confirm_plan
    exit 0
  fi

  detect_runtime
  confirm_plan

  run_backups
  rewrite_compose_images
  refresh_deployment

  cat <<EOF_DONE
Rollout completed.

Updated compose: ${DEPLOY_COMPOSE_FILE}
Image prefix: ${IMAGE_PREFIX}
Image tag: ${IMAGE_TAG}
Runtime used: ${RUNTIME} (${COMPOSE_CMD[*]})
EOF_DONE
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
