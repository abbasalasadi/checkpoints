# Handoff — 2026-11-03 (night)

**State:** V1 steps 1-9 done and pushed. Build + 145 tests pass on lan_vm1; every exercise passes parity in all three languages (rust 40, go 60, js 29). Nothing deployed (D13); only fake users (D14).

**Next action:** step 10 — run the app end to end in the browser (make run on laptop needs the three runner images; or run on lan_vm1), click through sign-in, tree, Run/Submit/Cancel/Format per language, fix what breaks; then self-audit (`docs/audits/`) and release note.

**Open / for the owner:**
- Deploy day: approve deploy, live DB merge (`make migrate-merge`), nginx with old-site disable (`LEGACY_DISABLE=1`); clear fake users first.
- Reference repos have committed env files (status "Needed from the owner").
- lan_vm1 (checkpoints-1) still holds the three runner images; remove them and send [RELEASE] when V1 checks end.
- Image tags are `:dev`/`:latest`; choose a production tag before deploy.
