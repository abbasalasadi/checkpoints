# Handoff — 2026-11-05

V4 tagged. DB sync DONE; old apps asleep (services disabled), static moved page only (2026-11-05). Next: ~2026-11-19 archive old DBs + V4 dev DB off-VM, then delete old apps (owner approval; list + freed space first).

Project done (owner, 2026-11-05). Old subdomains forwarded by DNS (Squarespace, 301). Only open item: ~2026-11-19 archive + delete old apps, certs and the moved-page vhosts on the VM, with owner approval.

Sequence (owner-approved order, option A: V4 data is dev testing, erased):
1. `make legacy-maintenance-on` (the three old sites → 503 maintenance; no off, ever). Check no active exam; `make maintenance-on` for the new site during the swap.
2. Final read-only copies of /opt/go-checkpoints/var/db/app.db, ~/js-checkpoints/var/db/app.db, ~/rust-checkpoints/var/db/app.db; `make backup`; `make migrate-merge` into a fresh DB; check counts; stop checkpoints, swap var/db/app.db, start, `make maintenance-off`; owner tests.
3. `make legacy-redirect` (old vhosts → static "moved" page linking to https://checkpoint.appsyss.com/; old confs kept as *.conf.old). Deploys keep LEGACY_REDIRECT=0.
Later: owner sets DNS redirect, then remove old apps from the VM (owner approval).
