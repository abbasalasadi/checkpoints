# Checkpoints — Current Release: V1

Copied from `versions.md` when this version started. **The only scope.** Scope test before every task: is it here? If not, do not do it.

**Goal:** One app where a student signs in once and practises Go, JS and Rust exactly as on the three live testers today.

Where the three references disagree, the Rust behaviour is the default (D16).

## Features
1. One sign-in with the Reboot01 username, valid for all three tracks; logout.
2. Track switcher and routes `/go/:slug`, `/js/:slug`, `/rust/:slug`; per-track checkpoint → level tree with status.
3. Workbench from the references: subject, Monaco editor, file tabs, args, Run, Submit, Cancel, Format (Go), autosave, reset, snapshots, stuck dialog, diagnostics.
4. Grading identical to the references; one streaming WebSocket protocol for all three.
5. One dispatcher: global queue, cooldowns 30 s Run / 90 s Submit from run end (D15).
6. One SQLite schema with `language` in every key; hashed session tokens (D6); attempts store files and output (D5).
7. Migration script merging the three live databases (fake data only until deployment, D14).
8. Deployment kit: systemd unit, nginx site with 301 redirects from the old subdomains, backups. Prepared, not run (D13).

## Definition of done
- [ ] Runs from a clean checkout (`make setup`, `make run`)
- [ ] Every reference solution passes and every starter fails, all three tracks
- [ ] Tests pass on the assigned VM
- [ ] Secret scan clean
- [ ] Deployed at checkpoints.appsyss.com after owner approval
- [ ] Every feature above present and working
- [ ] Self-audit passed (`docs/audits/`)
- [ ] Tagged `v1.0`, release note written

## Steps
| # | Step | Features | State | Result check |
|---|---|---|---|---|
| 1 | Monorepo skeleton (server + web workspaces, Makefile setup/run) | — | todo | — |
| 2 | Unified schema, migrations, empty DB, dev-only fake login | 1, 6 | todo | — |
| 3 | Unified content tree for go/js/rust | 2 | todo | — |
| 4 | Runner dispatcher, queue, cooldowns | 5 | todo | — |
| 5 | Go, JS, Rust runners + WebSocket streaming | 4 | todo | — |
| 6 | Content parity suite (solutions pass, starters fail) | 4 | todo | — |
| 7 | Web app: sign-in, tree, workbench | 1, 2, 3 | todo | — |
| 8 | Migration script tested on fake copies | 7 | todo | — |
| 9 | Deploy kit + redirects (not run) | 8 | todo | — |
| 10 | Self-audit, VM test run, release note | all | todo | — |
