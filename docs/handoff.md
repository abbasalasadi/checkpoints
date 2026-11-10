# Handoff — 2026-11-10

V4 (v4.0) live at checkpoint.appsyss.com; it replaced the three old sites. Data merged 2026-11-05; old subdomains forwarded by DNS (Squarespace, 301).
Old apps fully removed from the production VM on 2026-11-10; archive on the laptop in var/archive/ (git-ignored).
No open items. `make legacy-maintenance-on` / `legacy-redirect` are now obsolete (old hosts gone); remove them in the next release if wanted.
