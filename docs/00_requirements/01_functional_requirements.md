# 01 — Functional Requirements

This document defines the functional capabilities and user interactions of the unified `checkpoints` platform.

---

## 1. Authentication & Session Management

### 1.1 Upstream Reboot01 Authentication (SSO)
* **FR-AUTH-1:** The platform shall authenticate students against the official Reboot01 platform API (`https://learn.reboot01.com/api/auth/signin` or configured upstream).
* **FR-AUTH-2:** Authentication requires only the student's **Reboot01 username** and **password**.
* **FR-AUTH-3:** Usernames containing `@` (email addresses) or whitespace shall be rejected client-side and server-side before querying the upstream service.
* **FR-AUTH-4:** Successful authentication establishes a user record in the local database (if not already existing) and mints a cryptographically random, HTTP-only session cookie.
* **FR-AUTH-5:** The session cookie is valid across all language tracks (`Go`, `JavaScript`, `Rust`). Switching tracks or refreshing the browser shall not require re-authentication.
* **FR-AUTH-6:** A student may explicitly log out at any time, which invalidates the session in the database and clears the browser cookie.

---

## 2. Navigation & Track Selection

### 2.1 Multi-Language Track Selector
* **FR-NAV-1:** The workbench interface shall feature a prominent, top-level track switcher:
  * **Go**
  * **JavaScript**
  * **Rust**
* **FR-NAV-2:** Switching language tracks shall dynamically update:
  * The exercise navigation sidebar to display that language's checkpoint levels.
  * The Monaco editor's syntax highlighter and language service.
  * The active file structure and starter templates.
* **FR-NAV-3:** The user's active editor draft for each exercise shall be saved before navigating away, ensuring no work is lost when switching between languages.

### 2.2 Canonical Routing & Deep Linking
* **FR-NAV-4:** Every language, checkpoint, and exercise shall have a canonical URL:
  * Default entry: `https://checkpoints.appsyss.com/` (redirects to the last visited track or default track)
  * Track root: `https://checkpoints.appsyss.com/:lang` (e.g. `/go`, `/js`, `/rust`)
  * Exercise route: `https://checkpoints.appsyss.com/:lang/:slug` (e.g. `/go/printnbr`, `/rust/groceries`, `/js/elementary`)
* **FR-NAV-5:** Direct URL navigation or refreshing an exercise URL shall load that specific exercise, its subject description, and the user's latest saved code draft.

---

## 3. Exercise Catalogue & Progression Tree

### 3.1 Exercise Hierarchy
* **FR-CAT-1:** For each language, the sidebar shall group exercises into their official Reboot01 checkpoint structure:
  * **Checkpoint Level:** e.g., Checkpoint 01, Checkpoint 02, etc.
  * **Exercise Levels:** Level 00, Level 01, Level 02, etc.
* **FR-CAT-2:** Each exercise item in the tree shall display:
  * Exercise title and slug.
  * Completion status icon (`untouched`, `attempted`, `passed`).
  * Difficulty indicator or XP value (where available).

### 3.2 Subject Presentation
* **FR-CAT-3:** Selecting an exercise shall render the official subject in a dedicated resizable panel.
* **FR-CAT-4:** The subject view shall render:
  * The problem instructions and constraints.
  * Expected file names and signatures (e.g. `piscine.go`, `main.rs`, `index.js`).
  * List of allowed standard library functions / crates.
  * Examples of expected inputs, outputs, and edge cases.

---

## 4. Code Editor & Workbench

### 4.1 Monaco Editor Integration
* **FR-EDIT-1:** Code editing shall be powered by Monaco Editor with syntax coloring tailored to the active language:
  * Go: Go grammar tokenizer.
  * JavaScript: JavaScript/TypeScript tokenizer.
  * Rust: Rust grammar tokenizer.
* **FR-EDIT-2:** Editor features shall include line numbers, bracket matching, code folding, indentation guides, and keyboard shortcuts (`Ctrl+S` / `Cmd+S` to save, `Ctrl+Enter` to run).

### 4.2 File Management & Starter Code
* **FR-EDIT-3:** On first opening an exercise, the editor shall populate with that exercise's official starter code.
* **FR-EDIT-4:** If an exercise requires multiple files (e.g. `student.go` or module definitions), the workbench shall provide a tabbed or tree file selector.
* **FR-EDIT-5:** A **"Reset Code"** action shall allow students to revert their editor contents back to the official starter template with a confirmation prompt.

### 4.3 Draft Auto-Save
* **FR-EDIT-6:** As the student types, code changes shall be automatically persisted:
  * Instantly saved to browser local state / IndexedDB.
  * Debounced (after 900 ms of inactivity — decisions D7) and synchronized to the backend database.

---

## 5. Code Execution & Grading

### 5.1 Dual Execution Modes
The platform shall provide two distinct execution actions:

1. **Run Mode (`Run` button):**
   * Intended for rapid development and manual testing.
   * Compiles and executes the student's code against a lightweight demonstration driver or custom arguments.
   * Skips formatting checks and forbidden function gates.
   * Streams stdout and stderr directly to the terminal.

2. **Submit / Test Mode (`Test` / `Submit` button):**
   * Executes the full official 01-edu verification suite.
   * Strictly enforces all pre-test gates (e.g., Go formatting with `gofumpt`, forbidden call AST checking with `rc`).
   * Evaluates assertions and assigns an official verdict (`passed`, `failed`, `unformatted`, `forbidden`, `build_error`, `missing_file`, `timeout`, `output_limit`, `oom`, `cancelled`, `error`).

### 5.2 Real-Time Output Streaming (Terminal)
* **FR-TERM-1:** Execution output shall stream in real time via WebSocket over `/ws/output?run=<id>`. On desktop, output renders into an integrated `xterm.js` canvas terminal. On mobile/touch devices, output dynamically renders into an accessible ANSI-parsed plain-text terminal (`PlainTerminal`) to enable native touch text selection and eliminate keyboard focus-stealing.
* **FR-TERM-2:** ANSI color codes, text styling, and cursor movements from compilers (`cargo`, `go build`, `node`) shall render correctly.
* **FR-TERM-3:** The terminal shall display execution metadata: time elapsed, container queue status, exit code, and final verdict.

---

## 6. Snapshots & Audit History

### 6.1 Snapshots
* **FR-HIST-1 (Automatic Passing Snapshot):** Whenever a submission receives a `passed` verdict, the exact code files submitted shall be saved as a permanent `passing` snapshot.
* **FR-HIST-2 (Manual Snapshot):** Students can manually trigger a named snapshot of their current code at any milestone.
* **FR-HIST-3 (Snapshot Inspection & Restore):** Students can view previous snapshots in a slide-out drawer and restore them into the editor.

### 6.2 Attempt Logging
* **FR-HIST-4:** Every `run` and `submit` action shall be logged in the database with:
  * Timestamp, language track, and exercise slug.
  * Mode (`run` vs `submit`).
  * Outcome verdict and numeric exit code.
  * Execution duration in milliseconds.

---

## 7. Platform Info & Community Acknowledgements (About Modal)

* **FR-ABOUT-1 (Modal Access):** Accessible from the workbench header and overflow menu (`⋯`).
* **FR-ABOUT-2 (Authorship & Contact):** Displays lead developer details (**Abbas Hasan**, Discord: `@abbhasan`).
* **FR-ABOUT-3 (Community Acknowledgements):** Explicitly recognizes and thanks **Ali Alsaroo** (`aalsaroo`) for frontend and UX contributions (mobile ergonomics, touch symbol bar, pedagogical friction hint design, and exam testing).
* **FR-ABOUT-4 (Platform Disclaimer):** Displays the non-affiliation notice clarifying this is an independent, free student project.

