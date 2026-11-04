# Checkpoints — Status

As of: 2026-11-04 · Version: V3 in progress, steps 1-8 done; waiting for the owner's local test (D20), then deploy with approval · Run mode: economy · Forecast completion: <date> (<change since last>)

## Claims
| Step | Agent / role | Since | Branch / worktree |
|---|---|---|---|
| (none) | | | |

## Done
- V3 step 8 (2026-11-04): lan_vm1 server 45/45, web 141/141; parity Go 60/60, JS 29/29, Rust 40/40 ×3 (after fixing a Rust stale-build race: whole-second tar mtimes let cargo reuse the previous build; files now re-stamped before cargo), Java image 132/132, Java Cloud Run wrapper 133/133. Self-audit pass, F1-F3 minor fixed (docs/audits/v3.0-2026-11-04.md). DEV_LOGIN off locally (never on in production); fake users fake_v3_ui, fake_exam_ui deleted with their exams, plus orphan rows of earlier fake users (backup var/db/app.pre-step8.bak). Release note draft docs/releases/v3.0.md. Result check: every gate's own count read from its log — pass
- V3 7f Java on Cloud Run (owner approved 2026-11-04, same principle as Go/JS): wrapper docker/runner-java/cloudrun (Java, no new deps, same NDJSON contract, one request per instance, /tmp and request dir wiped). Result check: tools/java-cloudrun-check.mjs on lan_vm1 against the wrapper container, 133/133 (44 solutions pass, 44 starters fail on the same warm instance, 44 runs print, ../ names refused), submit median 8.6 s — pass. Service not created yet: at release, with approval (min-instances 0, small max, concurrency 1, ~1 GiB)
- V3 7a-7e Java (2026-11-04): 44 exercises per the program's list.json (D34: breakdown-url removed; todo-list expects Task.java + TodoList.java). Starters, solutions, hints 44/44. Runner image (Temurin 21, Maven 3.9.12 offline) built on lan_vm1; JavaBackend; migration 007 (runner now applies migrations with foreign keys off, SQLite rebuild procedure: every row kept, orphans included); web /java route, Monaco, AssertJ/JUnit diff, javac/Maven diagnostics. Result check: image gate 135/135 on lan_vm1 (then 45 exercises; solutions pass, starters fail, Run prints), submit median 9.0 s, run ~1.7 s; laptop java-check 45/45 both ways; server 44/44, web 141/141; browser: /java tree 3 checkpoints, editor tabs — pass. Parity with the official image not run: only its exported filesystem exists; verdicts come from its harness and tests, verbatim. Two README runner examples did not compile (digitlen, singleton-blueprint) and are fixed on import
- V3 steps 1-6 built (2026-11-04): mock exam (levels open one at a time, top bar, reports show only seen levels), hints 129/129, assertion card, palette, shortcuts, focus mode, breadcrumbs, next-exercise prompt; About thanks card. Result check: server 43/43, web 136/136, browser checks of exam flow (pass moves to next level) — pass. Owner: happy with the app (2026-11-04)
- V3 step 7 Java designed: docs/01_design/07_java_track.md, D30-D33. 45/45 exercises matched to subjects and tests
- V2 deployed 2026-11-04 to checkpoint.appsyss.com after owner approval: prod DB backup, migrations 004/005 applied, service healthy, old sites 200 (untouched). Result check: deploy rc 0, health ok, /api/vault 401 unauthenticated as expected, migrations logged — pass. Tagged v2.0
- V2 steps 1-8 built (2026-11-04), step 9 self-audit pass (docs/audits/v2.0-2026-11-04.md). Result check: lan_vm1 build, server 0 fail, web 116/116, Go parity 60/60 with read-only root; laptop server 40/40, web 117/117; browser checks per step in release.md — pass. Waiting for the owner's local test (D20); no deploy before it
- V1 self-audit (2026-11-03): first pass Fail (F1 blocking: setup needed .env.example); fixed in 8e9c919; re-audit on clean lan_vm1 copy: setup, build, 145 tests pass; F2 fixed; F3 (Go read-only rootfs) moved to V2. Report: docs/audits/v1.0-2026-11-03.md
- V1 steps 1-9 built and integrated (2026-11-03). Result check: lan_vm1 build + 145 tests (36 server, 109 web) — pass; runner images built (go 546 MB, js 109 MB, rust 1.25 GB); `make parity` — rust 40/40, go 60/60, js 29/29 solutions pass and starters fail, run + Go format ok — correct (matches the references)
- Browser check on laptop (fake user): sign-in, Go/JS/Rust switcher, checkpoint → level tree, Rust Submit (streamed output, diagnostics, 90 s cooldown), JS Run (streamed, 30 s cooldown) — pass. Go in the browser not yet clicked through (no Go image on laptop; Go runner proven by parity on lan_vm1)
- API smoke test on lan_vm1 (`scripts/smoke-vm.sh`), all three languages: dev login, detail, Run (+ 30 s cooldown 429), Go Format (changed files), Submit with reference solution = passed, Cancel, attempts — pass. Fixed on the way: format never reported changed files
- Local smoke test: dev login, /api/{go,js,rust}/exercises (60/29/40), detail, save — pass

## Running
- VM: lan_vm1 assigned (checkpoints-1, shared, 4 threads / 6 GB / 15 GB disk, ~2 days from 2026-11-03). Start runs only when `make health HOST=lan_vm1` shows 1-min load < 4 and > 8 GB free. On finish: clean task folders and Docker images, send [RELEASE].

## Blocked
- <item> — <cause> — <what unblocks it; sweep state if a result was wrong>

- Local `.env` and production `.env.vm`: cooldowns 15/60 (D19). DEV_LOGIN off in both.

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

- 2026-11-04: V1.0 tagged and redeployed (15/60 cooldowns). Result check: live 200, old sites 200, prod env 15/60, service active.
