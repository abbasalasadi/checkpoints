#!/usr/bin/env bash
# (DEPLOY) Build the Rust runner image ON the VM.
#
# Built there rather than shipped as a tarball: the Dockerfile is small, base
# layers cache, and a transferred image would be ~900 MB per deploy. The backend
# fails fast at startup if the image is missing, so a mismatch cannot go unnoticed.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args
image="$(resolve_runner_image)"
print_info "[VM] Building runner image ${image}"
ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)" \
  "cd '${REMOTE_PROJECT_DIR}' && docker build -t '${image}' docker/runner"
print_info "[VM] runner image ready"
