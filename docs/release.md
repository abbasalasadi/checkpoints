# Checkpoints — Current Release: V2

Copied from `versions.md` when this version started. **The only scope.** Scope test before every task: is it here? If not, do not do it.

**Goal:** A student can see and reuse everything they have done across all three tracks.

No deploy until the owner has tested locally (D20). Old sites are not touched (D21).

## Features
1. Dashboard: per-track progress cards, quick resume, recent activity, gate statistics. Track choice lives here; the workbench sidebar loses its Go/JS/Rust selector (D23).
2. History explorer with filters and attempt detail (code + output).
3. Solutions vault, and a per-exercise Markdown report export: subject, provided main file(s), student solution, result (D22).
4. Preferences (theme, font size, tab size, word wrap, keybindings Default/Vim) synced to the account (D24).
5. Stars (private), sidebar search and status filters, compact sidebar rail.
6. Mobile and tablet layouts: tabbed single pane, plain-text terminal, symbol bar, undo/redo.
7. Offline indicator with draft re-sync; loading skeletons.
8. Hardening: Go run containers with a read-only root filesystem (Go cache and temp on tmpfs), then re-run Go parity (audit v1.0 F3).

## Definition of done
- [ ] Every feature above present and working
- [ ] Tests pass on the assigned VM; Go parity re-run after feature 8
- [ ] Secret scan clean
- [ ] Owner tested locally (D20)
- [ ] Deployed at checkpoint.appsyss.com after the owner's test
- [ ] Self-audit passed (`docs/audits/`)
- [ ] Tagged `v2.0`, release note written

## Steps
| # | Step | Features | State | Result check |
|---|---|---|---|---|
| 1 | Preferences: schema, API, settings panel, applied to the editor | 4 | todo | |
| 2 | Dashboard + track choice moved out of the sidebar | 1 | todo | |
| 3 | History explorer and attempt detail | 2 | todo | |
| 4 | Solutions vault + exercise report export | 3 | todo | |
| 5 | Stars, sidebar search/filters, compact rail | 5 | todo | |
| 6 | Offline indicator, draft re-sync, skeletons | 7 | todo | |
| 7 | Mobile and tablet layouts | 6 | todo | |
| 8 | Go read-only rootfs + Go parity on lan_vm1 | 8 | todo | |
| 9 | Self-audit, VM test run, owner local test, release note | all | todo | |
