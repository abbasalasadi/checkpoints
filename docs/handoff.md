# Handoff — 2026-11-10

V4 (v4.0) live at checkpoint.appsyss.com; it replaced the three old sites. Data merged 2026-11-05; old subdomains forwarded by DNS (Squarespace, 301).
Old apps fully removed from the production VM on 2026-11-10; archive on the laptop in var/archive/ (git-ignored).
Current release: V5 Admin view. Steps 1–3 done; next: owner tests locally (make run), then deploy with the owner's go (add ADMIN_USERNAMES=abbhasan to /etc/checkpoints/runtime.env; backup first, no migration).
