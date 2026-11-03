#!/usr/bin/env bash
# (DEPLOY) Enable the nginx maintenance page.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args
ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)" \
  "sudo mkdir -p \$(dirname '${REMOTE_MAINTENANCE_FLAG}') && sudo touch '${REMOTE_MAINTENANCE_FLAG}'"
print_info "[VM] maintenance mode ON"
