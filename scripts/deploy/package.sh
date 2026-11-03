#!/usr/bin/env bash
# (DEPLOY) Build the SPA and create the release archive.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
require_command tar
require_command npm

env_file="${ENV_FILE:-$ROOT_DIR/.env.vm}"
load_env_file "$env_file"

archive="$ROOT_DIR/dist/checkpoints-release.tar.gz"
staging="$ROOT_DIR/dist/deploy-root"
mkdir -p "$(dirname "$archive")"
rm -rf "$staging" "$archive"
mkdir -p "$staging"

print_info "[LOCAL] Building backend and SPA"
(cd "$ROOT_DIR" && npm run build --workspace server >/dev/null && npm run build --workspace web >/dev/null)
[ -d "$ROOT_DIR/web/dist" ] || die "SPA build failed: web/dist not found"
[ -d "$ROOT_DIR/server/dist" ] || die "backend build failed: server/dist not found"

# Allow-list, not deny-list: nothing ships unless it is named here.
copy() {
  [ -e "$ROOT_DIR/$1" ] || return 0
  mkdir -p "$staging/$(dirname "$1")"
  cp -a "$ROOT_DIR/$1" "$staging/$1"
}
print_info "[LOCAL] Packaging"
copy ".env.vm"
copy "Makefile"
copy "package.json"
copy "package-lock.json"
copy "server/package.json"
copy "server/dist"
copy "server/src/db/migrations"
copy "web/package.json"
copy "web/dist"
copy "content"
copy "docker"
copy "deploy"
copy "scripts/lib"
copy "scripts/deploy/check.sh"
copy "scripts/deploy/maintenance-on.sh"
copy "scripts/deploy/maintenance-off.sh"
copy "scripts/deploy/runner-image.sh"
copy "scripts/build-runner-images.mjs"
copy "scripts/deploy/vm.sh"
copy "scripts/backup.sh"
copy "scripts/migrate"

find "$staging" \( -name node_modules -o -name .git -o -name var -o -name '*.tsbuildinfo' \) \
  -prune -exec rm -rf {} + 2>/dev/null || true
# Development secrets must never reach the VM.
rm -f "$staging/.env" "$staging/.env.local"

tar -czf "$archive" -C "$staging" .
print_info "Created: $archive ($(du -h "$archive" | cut -f1))"
