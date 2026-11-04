# Handoff — 2026-11-04

V1.0 is tagged and live at https://checkpoint.appsyss.com. The old sites run untouched alongside it, with no redirect.
Cooldowns are 15 s Run / 60 s Submit, shared (D18, D19).

Next action: plan V2 with the owner (docs/versions.md).
Open item, for when the owner decides to switch over: re-snapshot and re-merge the three old databases, then `LEGACY_DISABLE=1 make nginx-setup`.
