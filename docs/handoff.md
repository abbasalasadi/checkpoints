# Handoff — 2026-11-04

**Next action:** wait for the owner's local test of V3 (D20): sign in locally with a real reboot01 login (DEV_LOGIN is off), try the Java track, a mock exam, hints. Java Run/Submit do not work on the laptop (no Java image here); they are proven on lan_vm1. After the owner's approval, deploy per `docs/releases/v3.0.md` → Deploy (DB backup, Java Cloud Run service, migrations 006+007, checks), then tag v3.0.

**State:** V3 steps 1-8 done, all pushed. Gates: see status.md. Tools: `tools/java-check.sh` (laptop), `tools/java-image-check.sh` and `tools/java-cloudrun-check.mjs` (lan_vm1), `npx tsx tools/parity.ts --lang go|js|rust` (lan_vm1).

**VM job rule:** preflight before any detached job (create var/, check images, smoke one case in the foreground); in `make run CMD=` write `$$` for shell variables.

**Notes:**
- Local DB backups: var/db/app.pre007.bak, var/db/app.pre-step8.bak (local only).
- The Rust stale-build fix (422af10) also affects the live Rust track once deployed.
- list.json (owner's program export) is untracked in the repo root.
