# 02 — Non-Functional Requirements & Constraints

This document defines performance, resource constraints, security boundaries, and operational guarantees for the unified `checkpoints` platform.

---

## 1. Host Infrastructure & Resource Constraints

### 1.1 Host Environment Context
* **Host Machine:** `appsyss-vm` (Debian Linux, 64-bit).
* **Hardware Limit:** **1.9 GB total system RAM**, shared with existing services (PostgreSQL, DNS, mail, other apps).
* **Disk Space:** SSD backed, but container caches and log rotations must be actively bounded.

### 1.2 Memory & Process Budgets
* **NFR-RES-1 (Single Process Backend):** The unified platform shall run as **exactly one Node.js process** in production, replacing the three independent Node processes previously running for Go, JS, and Rust.
* **NFR-RES-2 (Backend Memory Cap):**
  * Idle RSS: **< 70 MB**.
  * Peak RSS under active compilation and WebSocket streaming: **< 180 MB**.
* **NFR-RES-3 (Ephemeral Container Lifecycles):**
  * Containers must be launched with `--rm` to ensure instant deletion on exit.
  * Maximum memory per execution container: **256 MB** (with swap disabled).
  * CPU quota per execution container: **1.0 vCPU** (`--cpus=1.0`).
  * On client disconnect, timeout, or cancellation, the orchestrator shall actively kill and remove the associated container.

---

## 2. Security & Sandboxing Boundaries

### 2.1 Docker Socket Isolation
* **NFR-SEC-1 (Zero Client Reachability):** The host Docker socket (`/var/run/docker.sock`) must **never** be exposed over the network or made reachable from client requests.
* **NFR-SEC-2 (Server-Side Orchestration):** All container creation, streaming, and teardown must happen exclusively within the backend behind authenticated session validation.

### 2.2 Container Sandboxing
* **NFR-SEC-3 (Unprivileged Execution):** Containers must run as an unprivileged user (non-root UID/GID).
* **NFR-SEC-4 (Privilege Escalation Prevention):** Containers must launch with `--security-opt=no-new-privileges:true`.
* **NFR-SEC-5 (Capability Dropping):** Drop all Linux kernel capabilities (`--cap-drop=ALL`).
* **NFR-SEC-6 (Network Egress Quarantine):** Runners must execute with networking disabled (`--network none`) to prevent arbitrary outbound network calls, data exfiltration, or remote command-and-control.

### 2.3 Grading Integrity & Tamper Prevention
* **NFR-SEC-7 (Server-Side Test Injection):** Test suites, solution harnesses, and assertion code must reside exclusively on the server in read-only volumes mounted at run time. Student code cannot alter, overwrite, or inspect test harnesses.
* **NFR-SEC-8 (Input Size Boundaries):**
  * Maximum individual file size in submission: **256 KB**.
  * Maximum total request payload: **2 MB** (enforced at both Nginx and Express layers).

---

## 3. Concurrency, Queueing & Abuse Prevention

### 3.1 Central Concurrency Limits
* **NFR-CONC-1 (Global Active Run Cap):** A strict limit on concurrent local Docker executions (default: **2 concurrent runs**) shall be enforced centrally to prevent exhausting host RAM and CPU.
* **NFR-CONC-2 (FIFO Queueing):** When active executions reach the limit, incoming requests are placed in an orderly FIFO queue. The client receives real-time queue position updates via WebSocket.
* **NFR-CONC-3 (Queue Depth Cap):** The queue length is capped (e.g. 10 requests). If full, requests are rejected with `503 Service Unavailable (Queue Full)`.

### 3.2 Cooldowns & Rate Limiting
* **NFR-RATE-1 (Per-User Cooldown):** Enforce a mandatory cooldown between consecutive test runs per student:
  * Submit mode: 90 seconds, counted from the end of the previous run (D15).
  * Run mode: 30 seconds, counted from the end of the previous run (D15).
* **NFR-RATE-2 (API Rate Limiting):**
  * Authentication endpoints: 5 attempts per minute per IP.
  * General API endpoints: 60 requests per minute per user.

---

## 4. Grading Accuracy & Reliability

### 4.1 Strict 1:1 Parity
* **NFR-ACC-1 (Zero Deviation):** A submission that passes on this tester must pass on the official Reboot01 platform; a submission that fails on the platform must fail on this tester.
* **NFR-ACC-2 (Deterministic Pre-Test Gates):**
  * Go formatting check must use the exact `gofumpt` version from the official runner.
  * Go forbidden function check must use the official `rc` AST analyzer.
  * Rust test injection must use the identical `01-edu` differential test harness.

### 4.2 Timeouts & OOM Handling
* **NFR-TIME-1 (Execution Timeout):** Hard kill-switch at **30 seconds** for Go and JS executions; **90 seconds** for Rust (to accommodate cold crate compilation).
* **NFR-OOM-1 (Out-Of-Memory Detection):** The backend must inspect the Docker container's exit state (`OOMKilled`) to report an explicit `oom` verdict rather than a misleading assertion failure.

---

## 5. Storage & Database Guarantees

* **NFR-DB-1 (SQLite WAL Mode):** SQLite configured in Write-Ahead Logging (`WAL`) mode with `busy_timeout = 5000ms` and `synchronous = NORMAL`.
* **NFR-DB-2 (Zero Data Loss Migration):** Existing production records from the three separate databases must be fully migrated with foreign keys preserved.
* **NFR-DB-3 (Automated Backups):** Daily automated backups of `var/db/app.db` retained locally for 14 days.

