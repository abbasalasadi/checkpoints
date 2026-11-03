#!/usr/bin/env bash
# (DEPLOY) Disable the nginx maintenance page.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args
ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)" "sudo rm -f '${REMOTE_MAINTENANCE_FLAG}'"
print_info "[VM] maintenance mode OFF"
