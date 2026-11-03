#!/usr/bin/env bash
# (DEPLOY) Full deploy of the unified app: check, package, nginx/HTTPS, runner images,
# install, health check. PREPARED, NOT RUN: the cut-over is the owner's call.
#
# Order and safety properties follow the detecto methodology:
#   - maintenance is lifted by an EXIT trap set BEFORE it is enabled, so a
#     failure mid-deploy does not leave the site showing a maintenance page
#   - a disk preflight aborts rather than filling the VM
#   - the archive is streamed over SSH stdin into `tar -xzf -`, so a large
#     release never needs twice the disk
#   - the remote install refuses unsafe project directories before running rm -rf
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

require_command ssh
require_command tar

env_file="${ENV_FILE:-$ROOT_DIR/.env.vm}"

print_info "[LOCAL] Preflight checks"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/check.sh"

print_info "[LOCAL] Building the release"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/package.sh"

load_env_file "$env_file"
build_ssh_args

target="$(resolve_ssh_target)"
archive="$ROOT_DIR/dist/checkpoints-release.tar.gz"
project="${REMOTE_PROJECT_DIR}"
remote_env="${REMOTE_ENV_FILE}"
service="${REMOTE_SYSTEMD_SERVICE}"
host="${VM_DOMAIN}"
port="${API_PORT:-8157}"
bind="${SERVER_HOST:-127.0.0.1}"
node_bin="${NODE_BIN:-/usr/bin/node}"
install_script="/tmp/cp-install-$$.sh"
maintenance_on=0

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

# Disk preflight: compare what the release needs against free space PLUS what
# refreshing the existing install will reclaim.
expanded="$(tar -tvzf "$archive" | awk '{ total += $3 } END { printf "%.0f", total }')"
[ -n "$expanded" ] && [ "$expanded" -gt 0 ] 2>/dev/null || expanded=$(( $(wc -c < "$archive") * 3 ))
required_kb=$(( (expanded + 1023) / 1024 + 65536 ))

print_info "[VM] Checking disk space"
ssh "${SSH_ARGS[@]}" "$target" "PROJECT='$project' REQUIRED_KB='$required_kb' bash -s" <<'REMOTE_PREFLIGHT'
set -euo pipefail
mkdir -p "$PROJECT"
free_kb="$(df -Pk "$PROJECT" | awk 'NR==2 { print $4 }')"
reclaim_kb=0
for p in server web content docker deploy scripts package.json package-lock.json Makefile .env.vm; do
  [ -e "$PROJECT/$p" ] && reclaim_kb=$(( reclaim_kb + $(du -sk "$PROJECT/$p" 2>/dev/null | awk '{print $1}') ))
done
available=$(( free_kb + reclaim_kb ))
printf '  free %s KB + reclaimable %s KB = %s KB, need %s KB\n' "$free_kb" "$reclaim_kb" "$available" "$REQUIRED_KB"
[ "$available" -ge "$REQUIRED_KB" ] || { echo "ERROR: not enough disk in $PROJECT" >&2; df -h "$PROJECT" >&2; exit 1; }
REMOTE_PREFLIGHT

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

user="$(id -un)"; group="$(id -gn)"
mkdir -p "$PROJECT" "$PROJECT/var/logs" "$PROJECT/var/db"

env_dir="$(dirname "$REMOTE_ENV")"
if [ ! -d "$env_dir" ] || [ ! -w "$env_dir" ]; then
  run_privileged install -d -m 0755 -o "$user" -g "$group" "$env_dir"
fi

cd "$PROJECT"
# Remove only what we ship. var/ is untouched, so the database and student
# progress survive every deploy.
rm -rf server web content docker deploy scripts package.json package-lock.json Makefile .env.vm

tar -xzf - -C "$PROJECT"

# Production dependencies only, from the committed lockfile.
#
# Installed with the SAME node that will run the service: better-sqlite3 is a
# native module, and a prebuild fetched for one ABI will not load on another.
cd "$PROJECT"
PATH="$(dirname "$NODE_BIN"):$PATH" npm ci --omit=dev --no-audit --no-fund

cp "$PROJECT/.env.vm" "$REMOTE_ENV"
chmod 0600 "$REMOTE_ENV"

# The unit is a template shipped in the release (deploy/systemd/), so the
# laptop copy and the installed unit cannot drift apart.
unit_tmp="$(mktemp)"
sed -e "s|@PROJECT@|$PROJECT|g" -e "s|@ENV_FILE@|$REMOTE_ENV|g" -e "s|@NODE_BIN@|$NODE_BIN|g" \
    -e "s|@USER@|$user|g" -e "s|@GROUP@|$group|g" \
    "$PROJECT/deploy/systemd/checkpoints.service" > "$unit_tmp"
if grep -q '@[A-Z_]*@' "$unit_tmp"; then echo "unfilled placeholder in systemd unit" >&2; exit 1; fi
run_privileged install -m 0644 "$unit_tmp" "/etc/systemd/system/$SERVICE"
rm -f "$unit_tmp"
run_privileged systemctl daemon-reload
run_privileged systemctl enable "$SERVICE"
run_privileged systemctl restart "$SERVICE"
INSTALL

print_info "[VM] Refreshing nginx and HTTPS"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/nginx-setup.sh"

print_info "[VM] Enabling maintenance mode"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/maintenance-on.sh"
maintenance_on=1

print_info "[VM] Streaming and installing the release"
ssh "${SSH_ARGS[@]}" "$target" \
  "PROJECT='$project' REMOTE_ENV='$remote_env' SERVICE='$service' NODE_BIN='$node_bin' INSTALL_SCRIPT='$install_script' bash '$install_script'" \
  < "$archive"

print_info "[VM] Building the runner images (go, js, rust)"
ENV_FILE="$env_file" bash "$SCRIPTS_DIR/deploy/runner-image.sh"
# Migrations run at startup, so restarting after the image exists applies them
# and proves the runner preflight passes.
ssh "${SSH_ARGS[@]}" "$target" "sudo systemctl restart '$service'"

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
  print_info "✅ deployed to https://${host}"
else
  print_warn "service did not respond within two minutes: $health"
  print_warn "check with: make log-backend"
  exit 1
fi
