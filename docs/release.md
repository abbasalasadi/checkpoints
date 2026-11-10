# Release — V5 Admin view

Goal: a read-only admin page for admin accounts only (owner: abbhasan), with usage, performance and server health. Design: `docs/01_design/09_admin.md`.
V4 tagged `v4.0` 2026-11-05 (record: `docs/releases/v4.0.md`).
No deploy until the owner has tested locally (D20).

## Decisions (2026-11-10, owner)
- D36 Admins come from server config `ADMIN_USERNAMES`, checked on the server; non-admins get 404.
- D37 Totals and charts only: no student code, no per-student list.
- D38 The admin page uses the dashboard's design.
- D40 (owner, 2026-11-10) Admin page adds "Online now": usernames active in the last 5 minutes, with the exercise last run; this is the one list of names (amends D37). Day chart has axes; most used exercises has See all.
- D44 (owner, 2026-11-10) Admin: every tab, range and opened student is a browser history entry (/admin?range=, /admin/students[/name], /admin/server); Online now as aligned rows (student, doing, seen); Students filters (language, activity, exercises passed, mock exams, clear); Server tab with host memory, CPU, load, disk, backups and 24-hour charts sampled every minute in memory (nothing stored).
- D43 (owner, 2026-11-10) Most used exercises has tabs All / Go / JS / Rust / Java.
- D42 (owner, 2026-11-10) Admin page tabs: Usage (the only tab with the today / 7 days / 30 days range: new accounts, runs, submits, charts, performance, exercises, mock exams), Students (totals, active today/7/30 days, Online now, Students list), Server.
- D41 (owner, 2026-11-10) Admin page adds Students: every student with submissions, pass rate, exercises passed and exams; a student's summary shows per-language progress and submissions, and mock exam results. No code.
- D39 No database change in V5: no migration; admin reads use a read-only connection; backup before deploy.

## Steps
1. [x] Server: `ADMIN_USERNAMES` setting, `isAdmin` in `/api/me`, admin guard, `services/admin.ts`, `GET /api/admin/overview?range=`; read-only DB connection, no new migration; tests (admin sees data, others 404, admin connection cannot write, migration list unchanged)
2. [x] Web: Admin button in the title bar (admins only), `/admin` page in the dashboard's style
3. [x] Tests on lan_vm1: server 55/55, web 148/148, tsc clean (2213ba5)
4. [ ] Owner tests locally (D20)

4b. [x] Owner-test changes (D40): chart axes, See all, Online now; lan_vm1 server 55/55, web 148/148 (1d135f4)
4c. [x] Students list and summary (D41); tested on lan_vm1 (server 56/56, web 148/148)

## Done when
- [ ] All steps done, tests pass
- [ ] Owner tested locally (D20)
- [ ] Deployed with the owner's go, owner calls it stable, tagged `v5.0`
