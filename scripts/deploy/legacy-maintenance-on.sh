#!/usr/bin/env bash
# (DEPLOY) Put the three old sites (go-, js-, rust-checkpoints) on their own
# maintenance pages. There is no "off": they go to legacy-redirect next.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args
ssh "${SSH_ARGS[@]}" "$(resolve_ssh_target)" bash -s <<'REMOTE'
set -euo pipefail
sudo touch /opt/go-checkpoints/maintenance.flag
sudo mkdir -p /var/lib/js-checkpoints /var/lib/rust-checkpoints
sudo touch /var/lib/js-checkpoints/maintenance.on /var/lib/rust-checkpoints/maintenance.on
for h in go js rust; do
  printf '%s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h-checkpoints.appsyss.com/")"
done
REMOTE
print_info "[VM] old sites in maintenance (expect 503 above)"
