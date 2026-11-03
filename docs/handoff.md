# Handoff — 2026-11-03 (night, end)

**State:** V1 built, tested and audited; only deploy and tag remain, both owner actions (D13).
- lan_vm1: build + 145 tests pass from a clean copy; parity rust 40/40, go 60/60, js 29/29; API smoke test passes for all three languages.
- Browser click-through done for Rust and JS (Go proven through the API).
- Self-audit: docs/audits/v1.0-2026-11-03.md — Pass after fixes (F1, F2 fixed; F3 moved to V2).
- Release note draft: docs/releases/v1.0.md.

**Next action (with the owner):** deploy day — owner approves; clear fake users; `make migrate-merge` on the pulled live DBs; deploy; nginx with `LEGACY_DISABLE=1`; check; tag `v1.0`. Then start V2 with the owner.

**Open:**
- Production tag for runner images (now `:dev` / `:latest`).
- Reference repos have committed env files (status "Needed from the owner").
- lan_vm1 (checkpoints-1) holds the three runner images; remove and send [RELEASE] when the owner no longer needs VM checks.
- Model overrides (haiku/sonnet) fail with API 404 in this tool; audit ran on the default model under cost approval checkpoints-c2.
