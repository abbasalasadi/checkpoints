#!/usr/bin/env bash
# (DEPLOY) Build the three runner images ON the VM.
#
# Built there rather than shipped: Dockerfiles are small, base layers cache, and
# a transferred image is ~900 MB. The backend fails fast if an image is missing.
#
# Image directories, first match wins per language:
#   rust: docker/runner/rust, docker/runner-rust, docker/runner   (Rust reference layout)
#   go:   docker/runner/go,   docker/runner-go
#   js:   docker/runner/js,   docker/runner-js
# A language with no directory is reported and fails the step.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args

rust_image="$(resolve_runner_image)"
go_image="$(resolve_runner_go_image)"
js_image="$(resolve_runner_js_image)"

print_info "[VM] Building runner images: ${go_image}, ${js_image}, ${rust_image}"
ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)" \
  "PROJECT='${REMOTE_PROJECT_DIR}' RUST_IMAGE='${rust_image}' GO_IMAGE='${go_image}' JS_IMAGE='${js_image}' bash -s" <<'REMOTE'
set -euo pipefail
cd "$PROJECT"
build() { # lang image candidate-dirs...
  local lang="$1" image="$2"; shift 2
  for d in "$@"; do
    if [ -f "$d/Dockerfile" ]; then
      echo "  $lang: docker build -t $image $d"
      docker build -q -t "$image" "$d" >/dev/null
      return 0
    fi
  done
  echo "ERROR: no Dockerfile for the $lang runner (looked in: $*)" >&2
  return 1
}
build rust "$RUST_IMAGE" docker/runner/rust docker/runner-rust docker/runner
build go   "$GO_IMAGE"   docker/runner/go   docker/runner-go
build js   "$JS_IMAGE"   docker/runner/js   docker/runner-js
REMOTE
print_info "[VM] runner images ready"
