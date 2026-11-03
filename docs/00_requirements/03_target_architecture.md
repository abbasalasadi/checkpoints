# 03 — Target Architecture

This document specifies the monorepo organization, system architecture, backend service modularity, and API contracts for the unified `checkpoints` platform.

---

## 1. Monorepo Organization

```
checkpoints/
├── docs/                     # Specifications and architectural documentation
│   └── 00_requirements/     # Modular requirements suite
├── content/                  # Read-only canonical exercise contents & tests
│   ├── go/                   # Go exercises, canonical tests, index.json
│   ├── js/                   # JS exercises, canonical tests, index.json
│   └── rust/                 # Rust exercises, test crates, index.json
├── runner/                   # Docker build contexts & execution environments
│   ├── go/                   # Dockerfile, entrypoint.sh, rc tool, gofumpt
│   ├── js/                   # Dockerfile, sandbox image, test runner
│   └── rust/                 # Dockerfile, pre-cached cargo crates, runner scripts
├── server/                   # Unified Node.js / Express backend
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── config/           # Environment config (.env, .env.vm)
│       ├── db/
│       │   ├── index.ts      # SQLite connection & WAL management
│       │   ├── migrations/   # Schema migrations
│       │   └── migrate-old/  # Data migration tool for merging legacy databases
│       ├── logger.ts         # Structured logging (Pino)
│       ├── middleware/       # Auth guard, rate limiters, error handling
│       ├── repositories/     # Users, sessions, progress, attempts, snapshots
│       ├── routes/
│       │   ├── auth.ts       # /api/auth (login, logout, session check)
│       │   ├── exercises.ts  # /api/:lang/exercises (catalogue & subjects)
│       │   ├── runner.ts     # /api/:lang/run, /api/:lang/submit
│       │   └── websocket.ts  # /ws/output terminal stream
│       ├── services/
│       │   ├── auth.ts       # Reboot01 upstream exchange
│       │   ├── catalogue.ts  # Multi-language catalogue manager
│       │   └── runner/       # Pluggable runner engines
│       │       ├── types.ts  # RunRequest, RunResult, Outcome
│       │       ├── dispatcher.ts
│       │       ├── go-runner.ts
│       │       ├── js-runner.ts
│       │       └── rust-runner.ts
│       └── main.ts           # Unified server entrypoint
├── web/                      # Unified React / Vite SPA frontend
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── components/       # MonacoEditor, Terminal, SplitPane, ExerciseTree, LangPicker
│       ├── contexts/         # AuthContext, TrackContext, EditorContext
│       ├── lib/              # API client, WebSocket client, themes
│       ├── App.tsx           # Workbench layout & state coordination
│       └── styles.css        # Unified dark theme styling
├── scripts/                  # Operational scripts
│   ├── lib/common.sh         # Shared bash library
│   ├── build.sh
│   ├── test.sh
│   └── vm-deploy.sh          # Deployment script to appsyss-vm
├── Makefile                  # Root orchestrator: make setup, make run, make deploy
└── package.json              # Root npm workspace configuration
```

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    Client["Browser (Vite + React SPA)"] -->|HTTPS (Port 443)| Nginx["Nginx Reverse Proxy"]
    Nginx -->|Static Assets| SPADist["web/dist (Built SPA)"]
    Nginx -->|/api/*| ExpressBackend["Node.js Backend (Port 8133)"]
    Nginx -->|/ws/output| WSServer["WebSocket Server (Port 8133)"]

    subgraph BackendProcess ["Single Node.js Process"]
        ExpressBackend --> AuthGuard["Auth & Session Middleware"]
        AuthGuard --> CatService["Catalogue Service (Go / JS / Rust)"]
        AuthGuard --> DBRepo["Repositories (SQLite)"]
        AuthGuard --> RunnerDispatcher["Runner Dispatcher & Queue"]

        DBRepo --> AppDB[("var/db/app.db (WAL Mode)")]
        CatService --> ContentDir["content/{go,js,rust}/"]

        RunnerDispatcher -->|lang == 'go'| GoRunner["Go Runner"]
        RunnerDispatcher -->|lang == 'js'| JsRunner["JS Runner"]
        RunnerDispatcher -->|lang == 'rust'| RustRunner["Rust Runner"]
    end

    GoRunner -->|Local Docker or Cloud Run| GoSandbox["Go Runner Container"]
    JsRunner -->|Local Docker| JsSandbox["JS Runner Container"]
    RustRunner -->|Local Docker| RustSandbox["Rust Runner Container"]

    GoSandbox -.->|Stream stdout/stderr| WSServer
    JsSandbox -.->|Stream stdout/stderr| WSServer
    RustSandbox -.->|Stream stdout/stderr| WSServer
```

---

## 3. Pluggable Runner Architecture

To avoid monolithic coupling, execution logic is isolated into language-specific runner modules coordinated by a central dispatcher.

```typescript
export type Language = 'go' | 'js' | 'rust';
export type ExecutionMode = 'run' | 'submit';

export type RunRequest = {
  runId: string;
  userId: number;
  language: Language;
  exerciseSlug: string;
  mode: ExecutionMode;
  files: Record<string, string>;
  args?: string[];
};

export type Outcome =
  | 'passed'
  | 'failed'
  | 'unformatted'
  | 'forbidden'
  | 'build_error'
  | 'missing_file'
  | 'timeout'
  | 'output_limit'
  | 'oom'
  | 'cancelled'
  | 'error';

export type RunResult = {
  outcome: Outcome;
  exitCode: number;
  durationMs: number;
  output: string;
};

export interface LanguageRunner {
  readonly language: Language;
  probe(): Promise<void>;
  execute(req: RunRequest, onOutput: (chunk: string) => void): Promise<RunResult>;
}
```

### 3.1 Runner Dispatcher Responsibilities
1. **Central FIFO Queue:** Protects host VM from CPU/memory thrashing by enforcing a strict concurrency cap across all languages.
2. **Per-User Cooldown Enforcement:** Ensures students do not spam execution triggers.
3. **Transport Flexibility:** Dynamically chooses between local Docker execution (`dockerode`) or Google Cloud Run based on configuration (e.g. `RUNNER_BACKEND=docker|cloudrun`).

---

## 4. API Specification Contract

All endpoints require an active session cookie unless designated as public.

### 4.1 Authentication Endpoints
* `POST /api/auth/login` (Public)
  * Body: `{ "identifier": "<username>", "password": "<password>" }`
  * Response: `{ "ok": true, "user": { "id": 1, "username": "alice" } }`
* `GET /api/auth/me`
  * Response: Current user session details or `401 Unauthorized`.
* `POST /api/auth/logout`
  * Revokes session in DB and clears cookie.

### 4.2 Catalogue & Exercise Endpoints
* `GET /api/:lang/exercises`
  * Returns list of checkpoints, levels, and exercises for `:lang`.
* `GET /api/:lang/exercises/:slug`
  * Returns exercise details, markdown subject, starter code, and constraints.
* `GET /api/:lang/exercises/:slug/progress`
  * Returns the user's latest saved draft, status, and passing snapshots for `:lang/:slug`.
* `PUT /api/:lang/exercises/:slug/progress`
  * Body: `{ "files": { "filename": "code" } }`
  * Debounced auto-save endpoint to persist work in progress without changing `passed` status.
* `POST /api/:lang/exercises/:slug/snapshot`
  * Body: `{ "files": { "filename": "code" } }`
  * Creates a user-triggered manual code snapshot.
* `GET /api/:lang/exercises/:slug/snapshots`
  * Returns history of manual and passing code snapshots for `:lang/:slug`.

### 4.3 Execution & Output Endpoints
* `POST /api/:lang/run`
  * Body: `{ "slug": "<slug>", "files": { ... }, "args": [ ... ] }`
  * Response: `{ "runId": "<uuid>", "queuePosition": 0 }`
* `POST /api/:lang/submit`
  * Body: `{ "slug": "<slug>", "files": { ... } }`
  * Response: `{ "runId": "<uuid>", "queuePosition": 0 }`
* `GET /ws/output?run=<id>` (WebSocket Upgrade)
  * Streams raw stdout/stderr chunks and terminal metadata frames to client (`{ type: 'state' | 'output' | 'done', ... }`).

### 4.4 Dashboard, History & Solutions Endpoints
* `GET /api/dashboard`
  * Returns user progress overview across Go, JS, and Rust, recent activity feed, and gate metrics.
* `GET /api/history?lang=<lang>&mode=<mode>&outcome=<outcome>&page=1`
  * Paginated, filterable submission history.
* `GET /api/history/:id`
  * Returns detailed metadata, submitted files, and captured terminal output for an attempt.
* `GET /api/solutions`
  * Returns catalogue of all passing solutions for the authenticated student.
* `GET /api/solutions/export`
  * Streams a generated `.zip` archive containing the student's passing code files organized by track.

### 4.5 Mock Exam Simulation Endpoints
* `POST /api/mock/start`
  * Body: `{ "language": "go", "checkpoint": "02", "durationMins": 180 }` (default 180 mins / 3 hours, configurable)
  * Response: `{ "sessionId": "<uuid>", "currentExercise": { ... }, "endsAt": "<timestamp>" }`
* `POST /api/mock/:id/submit`
  * Grades the current mock level; on pass, automatically draws and returns the next level exercise.
* `POST /api/mock/:id/finish`
  * Concludes mock session and returns comprehensive diagnostic report.

### 4.6 User Account & Preferences Endpoints
* `GET /api/user/preferences`
  * Returns stored editor settings (theme, keybindings, tab size, auto-format).
* `PUT /api/user/preferences`
  * Body: `{ "theme": "vs-dark", "keybindings": "vim", "autoFormatOnSave": true }`
* `POST /api/user/starred/:slug`
  * Toggles the bookmark star for an exercise slug and returns the updated array of starred slugs.

