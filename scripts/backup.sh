#!/usr/bin/env bash
# (VM or LOCAL) Consistent online backup of the SQLite database.
#
#   scripts/backup.sh                 # back up DB_PATH into var/backups/
#   BACKUP_KEEP=30 scripts/backup.sh  # keep the newest 30 (default 14)
#
# Uses SQLite's online backup API (via better-sqlite3), so it is safe while the
# service is running in WAL mode — a plain `cp` of app.db can miss pages still
# in app.db-wal. The copy is integrity-checked and gzipped; a failed check
# deletes it and exits non-zero. Suitable for a daily cron or systemd timer.
# Reads only DB_PATH from the environment or $ENV_FILE (.env / .env.vm) and
# never prints any other value from it.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

env_file="$(resolve_env_file)"
if [ -z "${DB_PATH:-}" ] && [ -f "$env_file" ]; then
  DB_PATH="$(sed -n 's/^[[:space:]]*DB_PATH[[:space:]]*=[[:space:]]*//p' "$env_file" | tail -1 | tr -d "\"'\r")"
fi
db="${DB_PATH:-var/db/app.db}"
case "$db" in /*) ;; *) db="$ROOT_DIR/$db" ;; esac
[ -f "$db" ] || die "database not found: $db"

dest_dir="${BACKUP_DIR:-$VAR_DIR/backups}"
keep="${BACKUP_KEEP:-14}"
mkdir -p "$dest_dir"
chmod 0700 "$dest_dir"
out="$dest_dir/app-$(date -u +%Y%m%dT%H%M%SZ)-$$.db"

require_command node
require_command gzip
ROOT="$ROOT_DIR" SRC="$db" OUT="$out" node --input-type=module -e "
  import { createRequire } from 'node:module';
  let Database;
  for (const b of [process.env.ROOT + '/server/package.json', process.env.ROOT + '/package.json', process.cwd() + '/noop.js']) {
    try { Database = createRequire(b)('better-sqlite3'); break; } catch {}
  }
  if (!Database) { console.error('better-sqlite3 not found — run npm ci first'); process.exit(1); }
  const src = new Database(process.env.SRC, { readonly: true, fileMustExist: true });
  await src.backup(process.env.OUT);
  src.close();
  const chk = new Database(process.env.OUT, { readonly: true });
  const ok = chk.pragma('integrity_check', { simple: true });
  chk.close();
  if (ok !== 'ok') { console.error('integrity check failed: ' + ok); process.exit(1); }
" || { rm -f "$out"; die "backup failed"; }

gzip -9 "$out" || { rm -f "$out"; die "gzip failed"; }
chmod 0600 "$out.gz"
print_info "backup: $out.gz ($(du -h "$out.gz" | cut -f1))"

# Retention: keep the newest $keep.
ls -1t "$dest_dir"/app-*.db.gz 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f
