# Release — V5 Admin view

Goal: a read-only admin page for admin accounts only (owner: abbhasan), with usage, performance and server health. Design: `docs/01_design/09_admin.md`.
V4 tagged `v4.0` 2026-11-05 (record: `docs/releases/v4.0.md`).
No deploy until the owner has tested locally (D20).

## Decisions (2026-11-10, owner)
- D36 Admins come from server config `ADMIN_USERNAMES`, checked on the server; non-admins get 404.
- D37 Totals and charts only: no student code, no per-student list.
- D38 The admin page uses the dashboard's design.
- D40 (owner, 2026-11-10) Admin page adds "Online now": usernames active in the last 5 minutes, with the exercise last run; this is the one list of names (amends D37). Day chart has axes; most used exercises has See all.
- D39 No database change in V5: no migration; admin reads use a read-only connection; backup before deploy.

## Steps
1. [x] Server: `ADMIN_USERNAMES` setting, `isAdmin` in `/api/me`, admin guard, `services/admin.ts`, `GET /api/admin/overview?range=`; read-only DB connection, no new migration; tests (admin sees data, others 404, admin connection cannot write, migration list unchanged)
2. [x] Web: Admin button in the title bar (admins only), `/admin` page in the dashboard's style
3. [x] Tests on lan_vm1: server 55/55, web 148/148, tsc clean (2213ba5)
4. [ ] Owner tests locally (D20)

4b. [ ] Owner-test changes (D40): chart axes, See all, Online now; tests on lan_vm1

## Done when
- [ ] All steps done, tests pass
- [ ] Owner tested locally (D20)
- [ ] Deployed with the owner's go, owner calls it stable, tagged `v5.0`
