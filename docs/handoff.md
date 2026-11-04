# Handoff — 2026-11-04

V1 is live at https://checkpoint.appsyss.com, running next to the old three sites (they are untouched, with no redirect).

Next action: the owner tests with a real Reboot01 login (Run and Submit in Go, JS and Rust). Then, once the owner decides on the cut-over:
1. Put the old sites in maintenance and take fresh `sqlite3 .backup` snapshots of /opt/go-checkpoints, ~/js-checkpoints and ~/rust-checkpoints var/db/app.db.
2. Run `make migrate-merge`, stop checkpoints.service, put the result at ~/checkpoints/var/db/app.db, and start the service again.
3. Run `LEGACY_DISABLE=1 make nginx-setup` (redirects). Then tag v1.0 and finalize docs/releases/v1.0.md.
Restore the local .env cooldowns (30/90) before release sign-off. Production already uses 30/90.
