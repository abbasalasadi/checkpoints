#!/usr/bin/env bash
# (LOCAL) Remove runtime artifacts and build output. Never touches .env or source.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

print_info "[LOCAL] Removing runtime artifacts"
rm -rf "$LOG_DIR" "$TMP_DIR" "$VAR_DIR"/*.pid
rm -rf "$ROOT_DIR/server/dist" "$ROOT_DIR/web/dist"
find "$ROOT_DIR" -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true

if [ "${KEEP_DB:-0}" = "1" ]; then
  print_info "  keeping the database (KEEP_DB=1)"
else
  rm -rf "$DB_DIR"
  print_info "  removed the database — student progress is gone"
fi

ensure_runtime_dirs
print_info "✅ reset complete"
