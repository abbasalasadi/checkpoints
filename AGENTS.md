# Checkpoint — Agent Entry

Read this first, whatever tool you are. A tool that wants its own instruction file gets a one-line file pointing here.

## Read, in order
1. `/home/abbas/Documents/project_manager/INDEX.md` — then load only the files it names for this project's profile, at levels up to the current version.
2. `docs/versions.md` — all requirements, by version.
3. `docs/release.md` — the current version: the only scope.
4. `docs/status.md` — what is done, running, blocked; current claims.
5. `docs/handoff.md` — the exact next action.

## Scope test
Before every task: **"Is it in `docs/release.md`?"** If not, do not do it. A new idea goes as one line into `docs/versions.md` (right version) or `docs/later.md`; keep going.

## Laptop and VMs
If it computes (test suites, builds, whole-tree linters, data, training), run it on the project's assigned VM through `make send / verify / run / fetch / clean-task` in `/home/abbas/Documents/project_manager`. If it coordinates, decides, commits or deploys, keep it on the laptop. `clean-task` always runs. Details: `/home/abbas/Documents/project_manager/procedures/compute-delegation.md`.

## Asking the manager
Only this project's **main chat** talks to the manager; sub-agents never do. Use the blocks in `/home/abbas/Documents/project_manager/procedures/working-with-the-manager.md` for machines, ports, problems and releases. This project works alone: it never contacts, tracks or mentions other projects, reads only the shared library, and ignores any session other than the manager and the owner.

## Every change
- Claim your step in `docs/status.md` before starting; clear it when done.
- Run the pre-commit secret scan; never commit `.env*`, `secrets/`, keys or `var/`. Never print a secret value.
- Finish with the result check (`procedures/result-check.md`) and its line in the status.
- Update `docs/status.md`, then **commit and push** (laptop, main chat only).
- Overwrite `docs/handoff.md` at the end of every session.

## Project specifics
Checkpoint testers: Go, JavaScript, Rust. Browser-based exercises for reboot01 students. Deployed at go-checkpoints.appsyss.com, js-checkpoints.appsyss.com, rust-checkpoints.appsyss.com.
