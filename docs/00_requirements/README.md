# 00 Requirements — Specification Suite

This directory contains the detailed engineering requirements and architecture specifications for consolidating the three standalone Reboot01 checkpoint testers into a single, unified multi-language platform (`checkpoints`).

---

## 1. Context & Motivation

Three standalone platforms were built to allow Reboot01 students to practice coding checkpoints in their browser:
* **Go Checkpoints** (`/home/abbas/Documents/go-checkpoints` · `go-checkpoints.appsyss.com`)
* **JavaScript Checkpoints** (`/home/abbas/Documents/js-checkpoints` · `js-checkpoints.appsyss.com`)
* **Rust Checkpoints** (`/home/abbas/Documents/rust` · `rust-checkpoints.appsyss.com`)

While all three work reliably, running them as three isolated platforms creates significant drawbacks:
1. **User Experience:** Students must navigate three separate sites and sign in three separate times; their progress is split across three isolated databases.
2. **Code Duplication:** ~75–80% of frontend (Monaco editor, xterm.js terminal, split-views) and backend (auth, sessions, SQLite, rate limiting) code is duplicated.
3. **Host VM Contention:** The production host VM has **~1.9 GB of total RAM**. Running three separate Node.js server processes, three SQLite connection pools, and three Nginx configurations places unnecessary pressure on memory.

The unified `checkpoints` project combines these into a single full-stack application and single backend daemon while preserving 100% of the grading rigor and runner isolation of each language.

---

## 2. Document Suite Structure

The specification is divided into modular documents:

| Document | Title | Description |
|---|---|---|
| [**01_functional_requirements.md**](01_functional_requirements.md) | Functional Requirements | User flows, single sign-on (SSO), track switching, exercise catalogue, editor workbench, execution modes, and progress tracking. |
| [**02_non_functional_requirements.md**](02_non_functional_requirements.md) | Non-Functional Requirements | Host memory constraints (1.9 GB VM budget), security sandboxing, grading integrity, and concurrency controls. |
| [**03_target_architecture.md**](03_target_architecture.md) | Target Architecture | Unified monorepo structure, high-level system diagrams, API contract, and frontend/backend modular design. |
| [**04_data_model_and_migration.md**](04_data_model_and_migration.md) | Data Model & Migration | Unified SQLite schema with `language` compound keys and a zero-loss migration plan for live production databases. |
| [**05_execution_runners.md**](05_execution_runners.md) | Execution Runners | Deep specification for Go (`gofumpt` + `rc`), JS (Node sandbox), and Rust (`cargo test` + hidden crate) runners; Docker vs Cloud Run backends. |
| [**06_infrastructure_and_deployment.md**](06_infrastructure_and_deployment.md) | Infrastructure & Deployment | Ports, domain strategy (`checkpoints.appsyss.com`), Nginx proxying, legacy subdomain redirects, and systemd units. |
| [**07_dashboard_and_user_features.md**](07_dashboard_and_user_features.md) | Dashboard & User Features | Central student dashboard, submission history explorer, solutions vault & ZIP export, mock exam simulation, and user preferences. |

---

## 3. Scope & High-Level Principles

* **Single Sign-On (SSO):** A student logs in once using their Reboot01 username and password. Their session is valid across all three languages.
* **1:1 Grading Parity:** Grading results must exactly match the official 01-edu platform verdicts. No approximations or compromises on checks (e.g. Go formatting gates and forbidden function checking must remain intact).
* **Single Backend Daemon:** Exactly one Node.js process serves the API and orchestrates container executions, replacing the three existing processes.
* **Backward Compatibility:** Existing student URLs (`go-checkpoints.appsyss.com`, etc.) will permanently redirect (HTTP 301) to their respective routes on `checkpoints.appsyss.com` with deep linking preserved.

