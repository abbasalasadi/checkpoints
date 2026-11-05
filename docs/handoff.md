# Handoff — 2026-11-05

V4 deployed and tagged v4.0. DB sync prepared, waiting for the owner's go.

Sequence (owner-approved order, option A: V4 data is dev testing, erased):
1. `make legacy-maintenance-on` (the three old sites → 503 maintenance; no off, ever). Check no active exam; `make maintenance-on` for the new site during the swap.
2. Final read-only copies of /opt/go-checkpoints/var/db/app.db, ~/js-checkpoints/var/db/app.db, ~/rust-checkpoints/var/db/app.db; `make backup`; `make migrate-merge` into a fresh DB; check counts; stop checkpoints, swap var/db/app.db, start, `make maintenance-off`; owner tests.
3. `make legacy-redirect` (old vhosts → static "moved" page linking to https://checkpoint.appsyss.com/; old confs kept as *.conf.old). Deploys keep LEGACY_REDIRECT=0.
Later: owner sets DNS redirect, then remove old apps from the VM (owner approval).
