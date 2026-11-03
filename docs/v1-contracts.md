# V1 contracts (shared by the parallel build agents)

Base: the Rust reference, imported as-is. Go and JS are folded in. Settings conflicts: Rust wins (D16). Content conflicts (slugs, names, tests): never resolve — list them in `docs/status.md` "Needed from the owner".

- Languages: `go`, `js`, `rust`. Type `Language = 'go'|'js'|'rust'` exported from `server/src/languages.ts`.
- Content: `content/<lang>/exercises/<slug>/` + `content/<lang>/index.json`, each language keeping its reference's own file layout. The exercises service loads all three; every exercise object carries `language`.
- HTTP API: same routes as the Rust reference, prefixed by language: `/api/:lang/exercises`, `/api/:lang/exercises/:slug/...`. Auth stays `/api/auth/*`; add `POST /api/auth/dev-login {username}` only when `APP_ENV!=production` (D14).
- Session cookie: `cp_session`; DB stores SHA-256 of the token (D6).
- DB: SQLite WAL, Rust schema plus a `language` column in every exercise-keyed table and key; attempts keep files_json and output (≤1 MB) (D5). New migration files; empty DB on first run.
- Runs: `server/src/services/runner/` exports `submitRun({user, language, slug, files, args, mode:'run'|'test'})` returning a run id, plus an event emitter. WebSocket `/ws/runs/:id` streams JSON `{type:'state'|'output'|'done', ...}` (Go protocol). Rust backend = reference warm-container Docker runner; Go and JS backends = their references' Docker runners (Cloud Run code ported but off by default locally). Global queue concurrency 3, cooldown 30 s run / 90 s submit from run end (D15), limits 384 MB / 0.5 CPU / 60 s / 1 MB output (D16).
- Ports: API 8157, Vite 5203. Config from `.env` (see `.env.example`).
- Never commit, push, deploy, touch nginx, the live VMs or the reference repos (read only). Never read or print `.env*` values. Report changed files and open problems at the end.
