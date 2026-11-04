# Checkpoints — Current Release: V2

Copied from `versions.md` when this version started. **The only scope.** Scope test before every task: is it here? If not, do not do it.

**Goal:** A student can see and reuse everything they have done across all three tracks.

No deploy until the owner has tested locally (D20). Old sites are not touched (D21).

## Features
1. Dashboard: per-track progress cards, quick resume, recent activity, gate statistics. Track choice lives here; the workbench sidebar loses its Go/JS/Rust selector (D23).
2. History explorer with filters and attempt detail (code + output).
3. Solutions vault, and a per-exercise Markdown report export: subject, provided main file(s), student solution, result (D22).
4. Preferences (font size, tab size, word wrap, keybindings Default/Vim) synced to the account; dark theme only (D24, D25).
5. Stars (private), sidebar search and status filters, compact sidebar rail.
6. Mobile and tablet layouts: tabbed single pane, plain-text terminal, symbol bar, undo/redo.
7. Offline indicator with draft re-sync; loading skeletons.
8. Hardening: Go run containers with a read-only root filesystem (Go cache and temp on tmpfs), then re-run Go parity (audit v1.0 F3).

## Definition of done
- [x] Every feature above present and working
- [x] Tests pass on the assigned VM; Go parity re-run after feature 8
- [x] Secret scan clean
- [ ] Owner tested locally (D20)
- [ ] Deployed at checkpoint.appsyss.com after the owner's test
- [x] Self-audit passed (`docs/audits/`)
- [ ] Tagged `v2.0`, release note written

## Steps
| # | Step | Features | State | Result check |
|---|---|---|---|---|
| 1 | Preferences: schema, API, settings panel, applied to the editor | 4 | done (awaiting owner test) | server 37/37, web 109/109, browser: light theme, font, Vim, reload keeps them |
| 2 | Dashboard + track choice moved out of the sidebar | 1 | done (awaiting owner test) | server 38/38, web 110/110, browser: cards, resume, recent activity |
| 3 | History explorer and attempt detail (regrouped by exercise, D26) | 2 | done (awaiting owner test) | server 41/41, web 121/121, browser: exercise list, folded runs, submit compare diff |
| 4 | Solutions vault + exercise report export | 3 | done (awaiting owner test) | server 39/39, web 111/111, browser: /vault list, code view, report download (.md) |
| 5 | Stars, sidebar search/filters, compact rail | 5 | done (awaiting owner test) | server 40/40, web 111/111, browser: star, Starred filter, rail collapse |
| 6 | Offline indicator, draft re-sync, skeletons | 7 | done (awaiting owner test) | web 114/114, browser: offline banner + Run/Submit wait, browser draft restored and re-saved, skeletons |
| 7 | Mobile and tablet layouts | 6 | done (awaiting owner test) | web 116/116, browser 375 px: tabs, symbol bar insert + undo, Run → plain-text Output, dashboard stacks |
| 8 | Go read-only rootfs + Go parity on lan_vm1 | 8 | done | lan_vm1: go parity 60/60, run + format ok; server 0 fail, web 116/116 |
| 9 | Self-audit, VM test run, owner local test, release note | all | waiting for the owner's local test | audit docs/audits/v2.0-2026-11-04.md: pass |
