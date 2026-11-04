#!/usr/bin/env bash
# (DEPLOY) Validate the deployment configuration before anything is uploaded.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

env_file="${ENV_FILE:-$ROOT_DIR/.env.vm}"
load_env_file "$env_file"
build_ssh_args

for cmd in ssh tar npm docker; do
  command -v "$cmd" >/dev/null 2>&1 || print_warn "command not found locally: $cmd"
done

missing=()
for key in VM_HOST VM_USER VM_DOMAIN REMOTE_PROJECT_DIR REMOTE_ENV_FILE \
           REMOTE_SYSTEMD_SERVICE CERTBOT_EMAIL; do
  [ -n "${!key:-}" ] || missing+=("$key")
done
if [ ${#missing[@]} -gt 0 ]; then
  die "missing in $env_file: ${missing[*]}
       Fill these in before deploying — they have no safe defaults."
fi

case "${REMOTE_ENV_FILE}" in
  /run/*) die "REMOTE_ENV_FILE is under /run, which is tmpfs and is wiped on reboot.
       The service would crash-loop until someone redeployed. Use a persistent path." ;;
esac

[ -f "$ROOT_DIR/deploy/maintenance.html" ] || die "deploy/maintenance.html not found"
for l in go js rust; do [ -f "$ROOT_DIR/content/$l/index.json" ] || die "content/$l/index.json not found"; done

# ── Remote preflight ──────────────────────────────────────────────────────
# This script used to validate only local files, and reported "ok" against a VM
# that had the wrong node major, an unreachable nginx and no free port. A check
# that cannot fail for the reasons a deploy actually fails is not a check.
node_bin="${NODE_BIN:-/usr/bin/node}"
target="$(resolve_ssh_target)"

if ! ssh "${SSH_ARGS[@]}" -o ConnectTimeout=10 "$target" true 2>/dev/null; then
  die "cannot reach $target over SSH.
       Check VM_HOST, VM_USER, VM_SSH_PORT and VM_SSH_KEY in $env_file."
fi

remote_report="$(ssh "${SSH_ARGS[@]}" "$target" \
  "NODE_BIN='$node_bin' PORT='${API_PORT:-8157}' PROJECT='${REMOTE_PROJECT_DIR}' bash -s" <<'REMOTE'
set -uo pipefail
if [ -x "$NODE_BIN" ]; then
  major="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "${major:-0}" -ge 20 ] && echo "ok node $("$NODE_BIN" -v)" \
                           || echo "FAIL node $NODE_BIN is v$major, need >=20"
else
  echo "FAIL node $NODE_BIN not found on the VM"
fi

command -v nginx >/dev/null || [ -x /usr/sbin/nginx ] \
  && echo "ok nginx present" || echo "FAIL nginx is not installed"

command -v docker >/dev/null && docker ps >/dev/null 2>&1 \
  && echo "ok docker usable" || echo "FAIL docker missing, or this user cannot use it"

sudo -n true 2>/dev/null && echo "ok passwordless sudo" \
                         || echo "FAIL sudo requires a password; the deploy would hang"

# A port held by ANOTHER service is the failure that is hardest to read from a
# log later — the service starts, then dies on EADDRINUSE.
if ss -tln 2>/dev/null | grep -qE "[:.]${PORT}\\b"; then
  pgrep -af "checkpoints/server/dist/main.js" >/dev/null 2>&1 \
    && echo "ok port $PORT held by this app" \
    || echo "FAIL port $PORT is already in use by something else"
else
  echo "ok port $PORT free"
fi
REMOTE
)"

printf '%s\n' "$remote_report" | while IFS= read -r line; do
  case "$line" in
    ok*)   print_info "  ${line#ok }" ;;
    FAIL*) print_warn "  ${line#FAIL }" ;;
  esac
done

if printf '%s' "$remote_report" | grep -q '^FAIL'; then
  die "the VM is not ready for a deploy — see the warnings above."
fi

print_info "Deploy environment:  $env_file"
print_info "SSH target:          $(resolve_ssh_target)"
print_info "Public host:         ${VM_DOMAIN}"
print_info "Backend bind:        ${SERVER_HOST:-127.0.0.1}:${API_PORT:-8157}"
print_info "Remote project dir:  ${REMOTE_PROJECT_DIR}"
print_info "Remote runtime env:  ${REMOTE_ENV_FILE}"
print_info "Systemd service:     ${REMOTE_SYSTEMD_SERVICE}"
print_info ""
print_info "✅ deploy-check ok"
