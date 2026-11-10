# V5 Admin view — design

Approved by the owner 2026-11-10.

## Access
- `ADMIN_USERNAMES` in the server settings (comma list, matched on `identifier_normalized`); owner: `abbhasan`. Empty = no admins.
- `/api/me` returns `isAdmin`. Every `/api/admin/*` route checks it on the server; a non-admin (or signed out) gets 404, the same as an unknown route.
- The title bar shows **Admin** only when `isAdmin` is true. Page path `/admin`.

## Page content (read-only, range: today / 7 days / 30 days)
1. **Usage:** students total, active (today / 7 d / 30 d), new accounts; runs and submits per day and per language; top 10 exercises; exams started, finished, pass rate.
2. **Performance:** run and submit time per language (median and 95th percentile); share of system failures (timeout, runner error) versus wrong answers; busiest hours.
3. **Server health:** uptime, process memory, database size, time of the last backup.

Totals and charts only: no student code, no per-student list.

## Data
From existing tables only, no migration: `attempts` (language, slug, kind, outcome, duration_ms, created_at, exam_id), `users` (created_at, last_login_at), `sessions` (last_seen_at), `exams`. Computed on read in `services/admin.ts`; one route `GET /api/admin/overview?range=`.

## Data safety (owner, 2026-11-10)
- No migration in V5: `server/src/db/migrations/` is unchanged; a test fails the release if a new migration file appears.
- Admin queries are SELECT only, on a separate read-only database connection (`readonly: true`), so they cannot write even by mistake.
- No admin action changes data: the page has no buttons that edit or delete anything.
- Deploy as always: check no active exam, `make backup` first, then deploy; the backup is kept until the owner calls V5 stable.

## Look
Same as the dashboard: its cards, ring and bar styles, colours, spacing and light/dark theme; stat tiles across the top, then charts in cards; works at phone width.
