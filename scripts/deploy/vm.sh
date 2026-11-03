#!/usr/bin/env bash
# (DEPLOY) SSH into the deployment VM.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args
exec ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)"
