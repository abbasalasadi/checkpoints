#!/usr/bin/env bash
# (DEPLOY) Build the three runner images ON the VM.
#
# Built there rather than shipped: Dockerfiles are small, base layers cache, and
# a transferred image is ~900 MB. The backend fails fast if an image is missing.
#
# Contexts are assembled from content/<lang> by scripts/build-runner-images.mjs
# (Go and JS gather tests and solutions; Rust builds docker/runner as is).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args

rust_image="$(resolve_runner_image)"
go_image="$(resolve_runner_go_image)"
js_image="$(resolve_runner_js_image)"
# Cloud Run serves Go and JS; only Rust needs a local image then.
only="go,js,rust"
[ "${RUNNER_BACKEND:-docker}" = "cloudrun" ] && only="rust"

print_info "[VM] Building runner images (${only})"
ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)" \
  "NODE='${NODE_BIN:-node}' ONLY='${only}' PROJECT='${REMOTE_PROJECT_DIR}' RUST_IMAGE='${rust_image}' GO_IMAGE='${go_image}' JS_IMAGE='${js_image}' bash -s" <<'REMOTE'
set -euo pipefail
cd "$PROJECT"
RUNNER_IMAGE="$RUST_IMAGE" RUNNER_GO_IMAGE="$GO_IMAGE" RUNNER_JS_IMAGE="$JS_IMAGE" \
  "$NODE" scripts/build-runner-images.mjs --only "$ONLY"
REMOTE
print_info "[VM] runner images ready"
