#!/usr/bin/env bash
# Shared library for every script in this project. Source it, never execute it.
#
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
#
# Pattern follows docs/01-canonical.md: a *_DEFAULT constant per configurable
# value, and a resolve_*() that returns the environment override or the default.

set -euo pipefail

# ROOT_DIR is derived from this file's location, never from the caller's cwd.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
VAR_DIR="$ROOT_DIR/var"
LOG_DIR="$VAR_DIR/logs"
DB_DIR="$VAR_DIR/db"
TMP_DIR="$VAR_DIR/tmp"

ENV_FILE_DEFAULT="$ROOT_DIR/.env"
API_PORT_DEFAULT="8128"
WEB_PORT_DEFAULT="5190"
DOCKER_PORT_DEFAULT="8129"
RUNNER_IMAGE_DEFAULT="rust-checkpoints-runner:latest"

# ── Output ───────────────────────────────────────────────────────────────────
# Context prefixes match the Makefile's ## (CONTEXT) labels.

print_info() { printf '%s\n' "$*"; }
print_warn() { printf '[WARN] %s\n' "$*" >&2; }
die()        { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1${2:+ — $2}"
}

# ── Environment ──────────────────────────────────────────────────────────────

# Tolerant .env parser: handles CRLF, blank lines, # comments, and quoted values.
load_env_file() {
  local env_file="${1:-$(resolve_env_file)}"
  local line key value
  [ -f "$env_file" ] || die "Environment file not found: $env_file"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    [ "$key" != "$line" ] || continue
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    if [ "${value#\"}" != "$value" ] && [ "${value%\"}" != "$value" ]; then
      value="${value#\"}"; value="${value%\"}"
    elif [ "${value#\'}" != "$value" ] && [ "${value%\'}" != "$value" ]; then
      value="${value#\'}"; value="${value%\'}"
    fi
    export "$key=$value"
  done < "$env_file"
}

ensure_runtime_dirs() { mkdir -p "$LOG_DIR" "$DB_DIR" "$TMP_DIR"; }

# ── resolve_* — environment override, else default ───────────────────────────

resolve_env_file()    { printf '%s\n' "${ENV_FILE:-$ENV_FILE_DEFAULT}"; }
resolve_api_port()    { printf '%s\n' "${API_PORT:-$API_PORT_DEFAULT}"; }
resolve_web_port()    { printf '%s\n' "${WEB_PORT:-$WEB_PORT_DEFAULT}"; }
resolve_docker_port() { printf '%s\n' "${DOCKER_PORT:-$DOCKER_PORT_DEFAULT}"; }
resolve_runner_image(){ printf '%s\n' "${RUNNER_IMAGE:-$RUNNER_IMAGE_DEFAULT}"; }

# ── SSH (used by the deploy scripts added in phase 07) ───────────────────────

build_ssh_args() {
  SSH_ARGS=()
  SCP_ARGS=()
  if [ -n "${VM_SSH_PORT:-}" ]; then
    SSH_ARGS+=( -p "$VM_SSH_PORT" ); SCP_ARGS+=( -P "$VM_SSH_PORT" )
  fi
  if [ -n "${VM_SSH_KEY:-}" ]; then
    SSH_ARGS+=( -i "$VM_SSH_KEY" ); SCP_ARGS+=( -i "$VM_SSH_KEY" )
  fi
}

resolve_ssh_target() {
  if [ -n "${DEPLOY_SSH_TARGET:-}" ]; then printf '%s\n' "$DEPLOY_SSH_TARGET"; return; fi
  [ -n "${VM_USER:-}" ] || die "VM_USER is missing in the deploy environment"
  [ -n "${VM_HOST:-}" ] || die "VM_HOST is missing in the deploy environment"
  printf '%s@%s\n' "$VM_USER" "$VM_HOST"
}

# ── Process control ──────────────────────────────────────────────────────────

# Stop whatever holds a TCP port. Deliberately by port, not by PID file: a
# stale or deleted PID file must still result in a clean stop.
kill_by_port() {
  local port="$1" pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    printf '%s\n' "$pids" | xargs -r kill 2>/dev/null || true
    sleep 0.3
    pids="$(lsof -ti:"$port" 2>/dev/null || true)"
    [ -n "$pids" ] && printf '%s\n' "$pids" | xargs -r kill -9 2>/dev/null || true
    print_info "  stopped whatever held port $port"
  else
    print_info "  nothing on port $port"
  fi
}
