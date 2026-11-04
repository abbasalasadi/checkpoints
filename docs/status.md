# Checkpoints — Status

As of: 2026-11-03 night · Version: V1 (scoping) · Run mode: economy · Forecast completion: <date> (<change since last>)

## Claims
| Step | Agent / role | Since | Branch / worktree |
|---|---|---|---|
| — | — | — | — |

## Done
- V1 self-audit (2026-11-03): first pass Fail (F1 blocking: setup needed .env.example); fixed in 8e9c919; re-audit on clean lan_vm1 copy: setup, build, 145 tests pass; F2 fixed; F3 (Go read-only rootfs) moved to V2. Report: docs/audits/v1.0-2026-11-03.md
- V1 steps 1-9 built and integrated (2026-11-03). Result check: lan_vm1 build + 145 tests (36 server, 109 web) — pass; runner images built (go 546 MB, js 109 MB, rust 1.25 GB); `make parity` — rust 40/40, go 60/60, js 29/29 solutions pass and starters fail, run + Go format ok — correct (matches the references)
- Browser check on laptop (fake user): sign-in, Go/JS/Rust switcher, checkpoint → level tree, Rust Submit (streamed output, diagnostics, 90 s cooldown), JS Run (streamed, 30 s cooldown) — pass. Go in the browser not yet clicked through (no Go image on laptop; Go runner proven by parity on lan_vm1)
- API smoke test on lan_vm1 (`scripts/smoke-vm.sh`), all three languages: dev login, detail, Run (+ 30 s cooldown 429), Go Format (changed files), Submit with reference solution = passed, Cancel, attempts — pass. Fixed on the way: format never reported changed files
- Local smoke test: dev login, /api/{go,js,rust}/exercises (60/29/40), detail, save — pass

## Running
- VM: lan_vm1 assigned (checkpoints-1, shared, 4 threads / 6 GB / 15 GB disk, ~2 days from 2026-11-03). Start runs only when `make health HOST=lan_vm1` shows 1-min load < 4 and > 8 GB free. On finish: clean task folders and Docker images, send [RELEASE].

## Blocked
- <item> — <cause> — <what unblocks it; sweep state if a result was wrong>

- Dev setting: local `.env` cooldowns set to 0 (owner, 2026-11-04). Restore to 30/90 before release (checklist in release.md); production `.env.vm` unchanged at 30/90.

## Needed from the owner
1. **Leaked secrets in the reference repos:** `/home/abbas/Documents/js-checkpoints`, `/home/abbas/Documents/go-checkpoints` and `/home/abbas/Documents/rust` have `.env` and `.env.vm` tracked in git (Go's STATUS.md says the only secret there is `SESSION_SIGNING_KEY`, which the new app does not use). Rotate every key in them, then remove them from git and its history (about 20 minutes). Not touched by this project.

## Effort and cost
- checkpoints-c1 (approved, unused: sonnet and haiku overrides fail with API 404). checkpoints-c2 (manager approved 2026-11-03): default model, low effort, V1 self-audit — 1 sub-agent, 1 pass + 1 re-check.
- <agent class> at <effort> (<reason if above medium>) — wall time, cost, outcome
- Budget (paid resources only): spent <x> of <limit>

## 2026-11-04 — V1 deployed side by side
- Live at https://checkpoint.appsyss.com (health ok, dev login off, API needs sign-in). Old go-/js-/rust-checkpoints sites untouched and still serving (owner: no redirect for now). Deployed with `LEGACY_REDIRECT=0`.
- DB = merge of the three live DBs snapshotted 2026-11-04 ~07:08 (274 users). Old sites keep taking writes, so re-snapshot and re-merge before the real cut-over.
- Waiting on the owner: test with a real Reboot01 login (one Run/Submit per language).
- Result check: deploy health ok; old sites 200; Rust image v1.0 built on the VM (-j2), build cache pruned.
