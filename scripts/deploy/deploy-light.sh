#!/usr/bin/env bash
# (DEPLOY) Fast path: ship code changes without reinstalling dependencies.
#
# A full deploy spends almost all of its time in two places that a typical code
# change does not touch:
#
#   npm ci             ~10 min — better-sqlite3 has no prebuild for this
#                      platform, so it compiles the SQLite amalgamation at -O3
#                      on a 2-core VM
#   docker build       ~5 min  — the runner image
#
# This target skips both, plus nginx and certbot, and ships only the built
# application. It is for "I changed a component, redeploy" — the common case.
#
# THE CRITICAL PROPERTY IS THAT IT REFUSES WHEN SKIPPING IS UNSAFE. A light
# deploy that silently omits a step you needed is worse than no light deploy at
# all: the service comes up green while running against stale dependencies or a
# stale runner image. So each skipped step has a matching guard, and any guard
# that trips sends you to `make deploy` rather than guessing.
#
# Not skipped, because they are cheap and catch real breakage:
#   - the remote preflight (check.sh)
#   - maintenance mode, lifted by an EXIT trap set BEFORE it is enabled
#   - the health check
#
# Migrations are not handled here at all. They run at every server start, so
# restarting the service applies them — the same path a full deploy uses.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

require_command ssh
require_command tar

env_file="${ENV_FILE:-$ROOT_DIR/.env.vm}"

print_info "[LOCAL] Preflight checks"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/check.sh"

load_env_file "$env_file"
build_ssh_args

target="$(resolve_ssh_target)"
project="${REMOTE_PROJECT_DIR}"
remote_env="${REMOTE_ENV_FILE}"
service="${REMOTE_SYSTEMD_SERVICE}"
host="${VM_DOMAIN}"

# ── Guards ───────────────────────────────────────────────────────────────────
# Each answers: "would skipping a step leave the VM running something other than
# what this checkout describes?" The comparison is against the files the last
# deploy actually shipped, which are still on the VM — so no extra state to keep
# in sync, and nothing to go stale on its own.

print_info "[VM] Checking that a light deploy is safe"

local_sum() { [ -f "$ROOT_DIR/$1" ] && sha256sum "$ROOT_DIR/$1" | cut -d' ' -f1 || echo "absent"; }

remote_state="$(ssh "${SSH_ARGS[@]}" "$target" "PROJECT='$project' SERVICE='$service' bash -s" <<'REMOTE'
set -uo pipefail
sum() { [ -f "$PROJECT/$1" ] && sha256sum "$PROJECT/$1" | cut -d' ' -f1 || echo "absent"; }
echo "lock $(sum package-lock.json)"
echo "dockerfile $(sum docker/runner/Dockerfile)"
[ -f "/etc/systemd/system/$SERVICE" ] && echo "unit present" || echo "unit absent"
[ -d "$PROJECT/node_modules" ] && echo "modules present" || echo "modules absent"
REMOTE
)"

field() { printf '%s\n' "$remote_state" | awk -v k="$1" '$1 == k { print $2 }'; }

fail=0
note() { print_warn "  $1"; fail=1; }

[ "$(field unit)" = "present" ] || \
  note "no systemd unit on the VM — this project has never been fully deployed"
[ "$(field modules)" = "present" ] || \
  note "no node_modules on the VM — dependencies have never been installed"
[ "$(field lock)" = "$(local_sum package-lock.json)" ] || \
  note "package-lock.json differs from the VM — dependencies changed, npm ci is required"
[ "$(field dockerfile)" = "$(local_sum docker/runner/Dockerfile)" ] || \
  note "docker/runner/Dockerfile differs from the VM — the runner image would be stale"

if [ "$fail" -eq 1 ]; then
  die "a light deploy would not be safe here — run 'make deploy' instead."
fi
print_info "  dependencies and runner image are current — proceeding"

# ── Notify, then build and ship ──────────────────────────────────────────────
# Maintenance goes up BEFORE the local build, not after it, so anyone mid-session
# sees "back shortly" for the whole operation rather than being dropped without
# warning at the restart.
#
# It goes up AFTER the guards above, though: those abort without touching the VM,
# and a refused deploy should never take the site down for nothing.

archive="$ROOT_DIR/dist/checkpoints-release.tar.gz"
maintenance_on=0

# Armed BEFORE maintenance is enabled, so a failure below — including a failed
# build — cannot leave the site stuck showing the maintenance page.
cleanup() {
  local status=$?
  if [ "$maintenance_on" -eq 1 ]; then
    print_info "[VM] Disabling maintenance mode"
    if ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/maintenance-off.sh"; then
      maintenance_on=0
    else
      print_warn "could not disable maintenance mode — run: make maintenance-off"
    fi
  fi
  return "$status"
}
trap cleanup EXIT

print_info "[VM] Enabling maintenance mode"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/maintenance-on.sh"
maintenance_on=1

print_info "[LOCAL] Building the release"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/package.sh"

# The archive goes over stdin, so the install script cannot also come that way.
# Stage it on the VM first, then run it with the archive piped in.
install_script="/tmp/cp-light-$$.sh"

print_info "[VM] Staging the install script"
ssh "${SSH_ARGS[@]}" "$target" "cat > '$install_script' && chmod 0700 '$install_script'" <<'INSTALL'
#!/usr/bin/env bash
set -euo pipefail
trap 'rm -f "${INSTALL_SCRIPT:-}"' EXIT

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else "$@"; fi
}

# This function runs rm -rf. The guard is not optional.
case "$PROJECT" in
  ''|'/'|'/home'|'/var'|'/tmp'|'/usr'|'/etc'|'/opt'|'/srv') echo "refusing unsafe project dir: $PROJECT" >&2; exit 1 ;;
  *..*) echo "refusing project dir containing ..: $PROJECT" >&2; exit 1 ;;
esac

cd "$PROJECT"
# Note what is NOT removed: node_modules, which is why this is fast, and var/,
# which holds the database and every student's saved work.
rm -rf server web content docker deploy scripts package.json package-lock.json Makefile .env.vm

tar -xzf - -C "$PROJECT"

cp "$PROJECT/.env.vm" "$REMOTE_ENV"
chmod 0600 "$REMOTE_ENV"

# Migrations run on start, so this both applies them and proves the new build
# boots. Restart rather than reload: the process holds an open SQLite handle.
run_privileged systemctl restart "$SERVICE"
INSTALL

print_info "[VM] Streaming and installing the release"
ssh "${SSH_ARGS[@]}" "$target" \
  "PROJECT='$project' REMOTE_ENV='$remote_env' SERVICE='$service' INSTALL_SCRIPT='$install_script' bash '$install_script'" \
  < "$archive"

cleanup
trap - EXIT

print_info "[LOCAL] Waiting for the service to become healthy"
health="https://${host}/healthz"
ok=0
for _ in $(seq 1 24); do
  if curl -fsS "$health" >/dev/null 2>&1; then ok=1; break; fi
  printf '.'
  sleep 5
done
printf '\n'

if [ "$ok" -eq 1 ]; then
  print_info "✅ deployed (light) to https://${host}"
else
  print_warn "service did not respond within two minutes: $health"
  print_warn "check with: make log-backend"
  exit 1
fi
