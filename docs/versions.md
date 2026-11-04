# Checkpoints — Versions

All requirements, captured at the start, sorted by version. Only the current version (`release.md`) is built. Architecture, data model and stack are chosen with every version in view. Specification: `docs/00_requirements/`, `docs/01_design/`; decisions: `docs/decisions.md`.

Current version: **V1**

Reference projects (read-only sources to merge): Go `/home/abbas/Documents/go-checkpoints`, JS `/home/abbas/Documents/js-checkpoints`, Rust `/home/abbas/Documents/rust`.

## V1 Merge
**Goal:** One app where a student signs in once and practises Go, JS and Rust exactly as on the three live testers today.

**Features:**
1. One sign-in with the Reboot01 username, valid for all three tracks; logout.
2. Track switcher and canonical routes `/go/:slug`, `/js/:slug`, `/rust/:slug`; per-track checkpoint → level tree with status.
3. Workbench carried over from the references: subject, Monaco editor, file tabs, args, Run, Submit, Cancel, Format (Go), autosave, reset, snapshots (3 manual + last passing), stuck dialog, diagnostics.
4. Grading identical to the references; configuration conflicts default to Rust, content conflicts go to the owner (D16). One streaming WebSocket protocol for all three.
5. One dispatcher: global queue and per-user cooldowns 30 s Run / 90 s Submit from run end (D15).
6. One SQLite schema with `language` in every key; hashed session tokens (D6); attempts store files and output (D5).
7. Migration script that merges the three live databases (tested on fake data only until deployment, D14).
8. Deployment kit: one systemd unit, nginx site with 301 redirects from the three old subdomains, backups. Prepared, not run (D13).

**Done when:** runs from a clean checkout; every reference solution passes and every starter fails in all three tracks; tests pass on the assigned VM; secret scan clean; self-audit passed; deployed after owner approval; tagged `v1.0`.

## V2 Student features
**Goal:** A student can see and reuse everything they have done across all three tracks.

**Features:**
1. Dashboard: per-track progress cards, quick resume, recent activity, gate statistics. The Go/JS/Rust track choice moves here, out of the workbench sidebar (D23).
2. History explorer with filters and attempt detail (code + output).
3. Solutions vault, and an exercise report export per single exercise: subject (README), provided main file(s), student solution and result, as one Markdown file (D22).
4. Preferences (theme, font size, tab size, word wrap, keybindings) synced to the account.
5. Stars, sidebar search and status filters, compact sidebar rail.
6. Mobile and tablet layouts: tabbed single pane, plain-text terminal, symbol bar, undo/redo.
7. Offline indicator with draft re-sync; loading skeletons.
8. Hardening: Go run containers with a read-only root filesystem (Go cache and temp on tmpfs), then re-run Go parity (audit v1.0 F3; the Go reference also runs writable).

**Done when:** same pattern, tagged `v2.0`.

## V3 Exam and extras
**Goal:** A student can rehearse a timed checkpoint and get help without being handed the answer.

**Features:**
1. Mock exam: one random exercise per level, timer (default 180 min), pristine starters, practice drafts set aside on the server (D7), report.
2. Hints with a 10-second delay for every exercise (D4).
3. Command palette and keyboard shortcut sheet.
4. Assertion diff card on failed tests.
5. Focus (zen) mode, font controls, post-pass "next exercise" prompt, breadcrumbs.
6. Java as the fourth track: 44 checkpoint exercises, 3 checkpoints × 5 levels, same methods as Go/JS/Rust (D30–D33).

**Done when:** same pattern, tagged `v3.0`.

## V4 Weighted marks
**Goal:** Marks follow the platform weight (`baseXp`), shown only as percentages. Design: `docs/01_design/08_marks.md`.

**Features:**
1. Per-placement weight and category for all four tracks, imported from the owner's list.
2. Exam mark in percent; optional adds above 100%.
3. Exam result popup on finish, expiry or leaving.
4. Value (%) of each exercise on the exercise page and the exam page.
5. Dashboard and history show percentages instead of counts.

**Done when:** same pattern, tagged `v4.0`.

## After V4
Redirect the three old sites to the new one, after re-merging their databases (D21). Then the full visual redesign (owner's plan).
