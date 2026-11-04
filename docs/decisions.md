# Checkpoints — Decisions

## Profile (interviewed <date>)
```
Name / purpose:          <A1>
Audience:                <A2>   Subdomain: <A3>   Reuse from: <A4>
Surfaces:                <B1 list>   Build order: <B2>   Mobile: <B3>   Desktop: <B4/B5>
Start mode:              <C1>   Target: <C2>   Environments: <C3>   Replace placeholder: <C4>
Users:                   <D1>   Sign-in: <D2>   Registration: <D3>   Roles: <D4>   2FA: <D5>
Step-up actions:         <D6>   Sessions: <D7>
Data:                    server <E1>, device <E2>, classes <E3>, uploads <E4>, retention <E5>, backups <E6>
Connectivity:            real-time <F1>, offline <F2>, third parties <F3>, outbound <F4>
AI / ML:                 <G1..G4>
Device capabilities:     <H1>, background collection <H2>
Background and compute:  <I1..I3>
Containers:              <J1..J3>
Collaboration:           mode <K1>, effort <K2>, cloud sessions <K3>, Development area <K4>, schedule <K5>
Optional:                <L1..L6>
Done means:              <M1>
Overrides:               <M2>
Documents that apply:    <list from INDEX.md, with levels>
Documents not applicable: <list, one reason each>
```

## Stack
| Concern | Choice | Reason |
|---|---|---|
| Backend | Node 20 + TypeScript + Express | Override of the Python default: reuses the three working reference backends |
| Frontend | React 18 + Vite SPA, Monaco, xterm.js | Reuses the reference frontends |
| Database | SQLite (WAL), one file `var/db/app.db` | Single light instance; same as references |
| Runners | Docker per run via the Docker socket | Same as references; grading parity |
| Deployment | systemd unit + nginx on the deploy VM | Override of the Docker Compose default: the backend must drive the host Docker daemon, and the references already run this way |

## Threat model
<assets, actors, trust boundaries, top threats and their controls — sized to V1>

## Log
| Id | Date | Decision | Owner's words (verbatim, when theirs) | Reason |
|---|---|---|---|---|
| D1 | 2026-11-03 | `.env.vm` is git-ignored and backed up to PrivateBox with the project's other secrets; only `.env.example` is tracked | "You are right. .env.vm should be .gitignore and it should be consider in make push to my privatebox as one of the secrets." | Design doc wrongly marked it tracked |
| D2 | 2026-11-03 | Ports are reserved by the manager (`[PORTS] checkpoints-1`), not reused from the legacy testers | "send a message to the manager ask it to reserve a port for you." | Old and new must run side by side until cutover |
| D3 | 2026-11-03 | Cloud Run backend and the production migration/cutover are approved | "The three projects are already running and i know their costs. Already approved" | Owner decision |
| D4 | 2026-11-03 | Every exercise gets a short hint, written by us (derived from reference solutions where useful) | "you need to create simple hind for each exercise ... you can put your own simple line hint" | Spec left hint content undefined |
| D5 | 2026-11-03 | `attempts` gains `files_json` and `output` columns (output capped at 1 MB) | "i agree with your recommendations" | History detail view needs them |
| D6 | 2026-11-03 | Session tokens stored as SHA-256 hashes; raw token only in the cookie | same | A leaked DB must not yield live sessions |
| D7 | 2026-11-03 | Autosave debounce 900 ms; mock-exam practice drafts set aside on the server, not in browser storage | same | Resolves the spec conflicts; server copy survives device change |
| D8 | 2026-11-03 | Format-on-save runs through the runner queue as a `format` job with its own cooldown | same | Keeps the 2-container ceiling intact |
| D9 | 2026-11-03 | Accepted risk: the backend has Docker socket access (root-equivalent on the VM); mitigated by the socket never being reachable from requests, fixed images, and the hardened container flags | same | Required to run sandboxes locally |
| D10 | 2026-11-03 | Versions: V1 merge (parity, migration, redirects, deploy) · V2 student features · V3 exam and extras · then redesign | same | Ship the merge first |
| D11 | 2026-11-03 | Ports from manager (`[ANSWER] checkpoints-1`): `API_PORT=8157` (laptop; deploy VM on 127.0.0.1 behind nginx — confirmed free on the deploy VM by the manager (bind at deploy, which needs owner approval)), `WEB_PORT=5203` (laptop only) | — | Implements D2 |
| D12 | 2026-11-03 | No `SESSION_SECRET`: sessions are random 256-bit opaque tokens stored (hashed, D6) in the database, as in the reference projects; nothing is signed | "what is session secret? isnt it in the reference projects?" | The design doc listed an unused variable |
| D13 | 2026-11-03 | No deploy, migration or nginx change without the owner present; V1 stops at "tested locally and on the assigned VM" | "No, wait for me" | Deploying is an owner action |
| D14 | 2026-11-03 | Development uses an empty database with fake test users (dev-only login, refused when `APP_ENV=production`); live databases are pulled and migrated only just before deployment, after fake users are cleared | "for now just create empty database and create your own users with fake logins just for testing. we will clear your fake users before database sync before deployments." | Live data holds students' solutions |
| D15 | 2026-11-03 | Cooldowns 30 s Run / 90 s Submit per user, counted from the end of the previous run (as in the live references); replaces the spec's 5 s / 10 s | "keep the cooldown as 30 s / 90 s" | Matches production behaviour |
| D16 | 2026-11-03 | Where the Go, JS and Rust references conflict in configuration (cooldowns, limits, caps, concurrency and similar settings), Rust's value is the default (e.g. output cap 1 MB, memory 384 MB / 0.5 CPU, concurrency 3). Content conflicts (exercise names, slugs, subjects, tests) are never resolved automatically: they go to the owner under "Needs the owner" | "i mean by conflicts something like the cooldown timer configurations the default will be rust configuration. not something related to exercises like naming conflicts, if there is such conflicts, you need my manual action." | Owner instruction |
| D17 | 2026-11-04 | Sign-in uses the real Reboot01 username and password. The username-only dev login is off by default; it turns on only with `DEV_LOGIN=true` in a dev/test `APP_ENV`, and never in production. Automated tests and the VM smoke test opt in with fake users. Amends D14 | "login is running without actual username and password. let us correct it to use proper login username and password of reboot account" | Owner instruction |

Reversals are new rows pointing at the old id. Accepted security risks are recorded here with the owner's confirmation.

## D18 (2026-11-04) — One shared cooldown for Run and Submit
Owner: after Run or Submit, both buttons stay blocked until that one wait ends (30 s after Run, 90 s after Submit), and only one timer is shown. Amends D16's per-mode Rust behaviour. Server enforces the same rule.
