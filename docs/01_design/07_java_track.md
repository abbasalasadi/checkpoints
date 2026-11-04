# 07 — Java Track Design

Status: **design, approved scope, not implemented.** Owner decisions: D30–D33 (`docs/decisions.md`).
Scope test: V3 step 7 in `docs/release.md`. Nothing outside this document is in scope for the Java work.

Java becomes the fourth track of the unified app (checkpoint.appsyss.com), built **the same way as Go, JS and Rust**:
canonical content in `content/java/`, official tests taken verbatim from the official tester image, a runner image
of our own that carries the upstream harness unchanged, the same server/runner/web code paths, and the same
verification tools. No feature is Java-only.

---

## 1. Sources (all local, read-only)

| What | Where | Used for |
|---|---|---|
| Official tester image (exported filesystem) | `/media/abbas/Data D/00. Backup/Reboot/Master-Repos/Checkpoints/module-java-docker/` | tests, harness, `pom.xml`, `entrypoint.sh`, offline Maven repo, JDK version |
| Subjects | `.../Master-Repos/public-master.zip` → `public/subjects/java/checkpoints/<slug>/README.md` | README per exercise, expected classes, `ExerciseRunner` usage |
| Placements | owner's list (2026-11-04), recorded in `content/java/sources/placements.json` | checkpoint / level per exercise |

Facts established from the image:
- JDK: Eclipse Temurin **21.0.10+7** (Alpine). Compiler flags in `pom.xml`: source/target 15.
- `app/tests/<Class>_test/<Class>_test.java` + shared `app/tests/TestRunnerMain.java`, `StopAfterFailureExtension.java`.
- `app/tests_utility/` = offline Maven repository (33 MB): JUnit Jupiter 5.10.2, platform launcher 1.10.2, AssertJ 3.22.0, exec-maven-plugin.
- 111 test directories: the 45 checkpoint exercises below + 66 piscine exercises (**out of scope**, D31).
- Test fixtures: none for the 45 checkpoint exercises (only piscine `Capitalize` has files). Tests that do read files use absolute `/app/tests/...` paths, so the image keeps that layout anyway.

## 2. Exercises and placements (D30)

45 exercises, 3 checkpoints × 5 levels, **every exercise in exactly one placement**. Level 5 is "optional" on the
platform (a student who passed levels 1–4 is already through); **we treat it as a normal level** everywhere:
practice, dashboard counts, and the mock exam (which therefore has 5 levels for Java, like the other tracks).

| CP | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| 1 | goodbye-mars, system-logger, universal-greeting, average-calc | multiplication-table, unit-converter | strlen, count-char, digitlen | rotate-array, reverse-array, sort-array | almost-palindrom, factorial, next-prime |
| 2 | todo-list, time-tracker, date-formatter | area-calculator, factorial-master, flexisort | double-linked-list, circular-linked-list, single-linked-list | harmonious-fusion, distinct-substring-length, is-anagram | spiral-matrix, maximal-square, steady-sequence |
| 3 | day-of-week, monthly-period, age-finder | html-validator, breakdown-url, config-protector | singleton-blueprint, builder-blueprint, factory-blueprint | top-frequents, longest-common-prefix, first-unique | valid-sudoku, armstrong-number, perfect-number |

Checked 2026-11-04: all 45 have a subject and a test; the subject folder holds exactly these 45.

**Slug** = the upstream subject folder name (kebab-case, e.g. `almost-palindrom`, `breakdown-url`) — matches
`SLUG_PATTERN`, stays stable with the 01-edu URL. **Test class** = the image's directory name minus `_test`
(`AlmostPalindrome`, `HTMLValidator`, `BreakdownURL`), stored in `meta.json` as `test.className`; never derived at runtime.

## 3. Content layout (`content/java/`)

Same shape as `content/js` / `content/rust`:

```
content/java/
  index.json                         every exercise + every placement (schema 1, language "java")
  hints.json                         45 one-line hints (D29 rules: no code, no answer)
  sources/
    module-java-image.json           provenance: image path, JDK version, sha256 of every copied file
    placements.json                  the owner's list, verbatim structure
    harness/                         byte-identical from the image
      TestRunnerMain.java  StopAfterFailureExtension.java  pom.xml  entrypoint.sh
  exercises/<slug>/
    meta.json
    README.md                        verbatim from public-master.zip
    <Class>.java ...                 starter(s): one file per public type in "Expected Classes/Functions"
    ExerciseRunner.java              Run entry point, from the subject's usage block
    solution/<Class>.java ...        reference solution (ours, must pass the official test)
    test/<Class>_test.java           verbatim from the image (+ fixtures if any)
```

`meta.json` (Java fields; the rest identical to JS/Rust):

```json
{
  "slug": "factorial", "title": "Factorial", "language": "java", "status": "placed",
  "expectedFiles": ["Factorial.java"],
  "editorFiles": ["Factorial.java", "ExerciseRunner.java"],
  "files": { "subject": "README.md", "starter": ["Factorial.java"], "main": "ExerciseRunner.java",
             "solution": "solution/", "test": "test/" },
  "subject": { "repo": "01-edu/public", "path": "subjects/java/checkpoints/factorial/README.md", "sha256": "…" },
  "test": { "image": "module-java", "path": "/app/tests/Factorial_test", "className": "Factorial", "sha256": "…" },
  "placements": [{ "checkpoint": "1", "level": 5, "index": 2, "order": 2, "category": "optional" }]
}
```

**Multi-class exercises** (linked lists, `*-blueprint`, `todo-list`, `config-protector` …): Java requires one public
type per file, so `expectedFiles` = one file per public class/interface/enum in the subject's code block, in subject
order. The builder fills this automatically; any exercise where the parse is ambiguous is listed in the build output
and fixed by hand in `meta.json` (never silently guessed).

**Starter**: the subject's expected signatures with bodies replaced by `// your code here` and a type-correct
placeholder return, so the starter **compiles** (the test then fails, not the build) — same rule as Go/Rust starters.
Subjects that hand over "incomplete code to fix" (blueprints) keep that code as close to the subject as compiles.
7a finding: the subjects' code blocks are pseudo-code (`...`, `????`, missing bodies, one malformed fence), so
starters are **written by hand in 7b** and compile-checked, not generated. `expectedFiles` is generated: 8
multi-class exercises reviewed against their tests (2026-11-04), one pseudo-code type added by hand (`RegexBuilder`).

**Build tool**: `tools/java-content.ts` (reads the image dir + zip, writes `content/java/`, idempotent, prints a
diff summary). It is a one-off importer like the existing ones; the app never reads the image or the zip.

## 4. Runner image (`docker/runner-java/`)

- Base `eclipse-temurin:21-jdk-alpine` (same JDK major as upstream; minor pinned by digest, recorded in provenance).
- `/app`: `pom.xml`, `entrypoint.sh`, `tests/` (the 45 test dirs + the two harness files), `tests_utility/` (offline Maven repo), and Maven itself (`/usr/share/maven`, same version as the image).
- Built from a context assembled from `content/java/` by `scripts/build-runner-images.mjs` (new `java` target), like JS. Never built from the raw export.
- Hardened like the others: `USER nobody`, read-only rootfs, `/tmp` tmpfs, no network, CPU/memory/pids limits.
- **Writable paths**: upstream writes `project/` in its cwd and Maven may write resolver metadata into the local repo.
  The entrypoint runs with `cwd=/tmp/work`; if Maven needs to write the repo, it is copied to tmpfs at start
  (measured in step 7c; decision recorded either way).

**Grading = upstream, unchanged.** `entrypoint.sh` is used byte-identical:
- *Submit*: copies `EDITOR_FILES` (or `student/<EXERCISE>/*.java`), the two harness files and `tests/<EXERCISE>_test/*.java`
  into a Maven project and runs `mvn -q -o … test-compile exec:java@run-tests-via-main -DselectClass=<Class>Test`.
  Pass ⇔ the process exits with the random code written to `.exit` (anti-cheat: student code cannot fake it).
- *Run*: `CODE_EDITOR_RUN_ONLY=true` → `javac *.java -d build && java -cp build ExerciseRunner`.
- `EXERCISE` = `test.className` (not the slug).

Performance budget: JVM + Maven start is the cost. Target ≤ 6 s per submit on Cloud Run warm, ≤ 3 s per Run.
Owner (2026-11-04): measure after implementation, then decide. The possible fallback (it changes the grading
path, so it needs owner approval) is calling `javac` + the JUnit launcher directly with the same jars.

## 5. Where it runs (D32)

**Cloud Run**, like Go and JS (`RUNNER_BACKEND=cloudrun` for java). The VM (1.9 GB RAM) cannot afford JVMs.
- Cloud Run wrapper: a static Go binary (pattern of `docker/cloudrun/main.go`) copied into the Java image in a
  multi-stage build; it materialises files under `/tmp/work/student`, sets `EDITOR_FILES` / `EXERCISE` /
  `CODE_EDITOR_RUN_ONLY`, runs `/app/entrypoint.sh`, streams output, returns the exit code. Same HTTP contract as the Go/JS wrappers.
- Service settings: 1 vCPU, 1 GiB, concurrency 1, timeout as the other tracks, **min-instances 0**, a small
  max-instances cap, request-based billing, same region as Go/JS.
- Cost (owner, 2026-11-04: small amounts, go ahead): Java is an optional specialisation with far fewer students
  than Go/JS/Rust, so it fits the shared Cloud Run free allowance; extra image storage is cents a month. Measure
  CPU-seconds per Submit after 7f and record them here.
- Local development uses the Docker backend with the same image.

## 6. Server changes

| Area | Change |
|---|---|
| `server/src/languages.ts`, `services/runner/types.ts` | `Language` adds `'java'`; `LANGUAGES`; `SOURCE_EXT.java = 'java'` |
| DB | **migration 007**: SQLite cannot alter a `CHECK`, so `progress`, `attempts`, `snapshots` (003) are rebuilt with `language IN ('go','js','rust','java')` — copy, drop, rename, re-create indexes, in one transaction; row counts asserted. `exams` has no language CHECK. Backup before deploy as always. |
| `services/exercises.ts` | loads `content/java` like the others (index, meta, README, starters, main, hints) |
| `services/runner/java.ts` | new runner: env (`EXERCISE`, `EDITOR_FILES`, `CODE_EDITOR_RUN_ONLY`), files under `student/`, outcome mapping: exit 0 → passed; compile error text (`javac` / `COMPILATION ERROR`) → `build_error`; missing expected file → `missing_file`; else `failed` |
| dispatcher / settings | `java` in backend selection, cooldowns, limits (`timeoutSeconds` may be higher) |
| routes | none Java-specific: all routes are already language-scoped |
| exams | none: `pickExamItems` works from placements; Java gives 5 levels |
| format | no formatter for Java (Format button hidden, as for JS/Rust) |

## 7. Web changes

- `Language` + `LANGUAGES` + `LANGUAGE_LABEL.java = 'Java'`; route `/java/<slug>`; dashboard card; mock-exam track list.
- Monaco language `java`; file tabs from `editorFiles`.
- `lib/assertion.ts`: parse AssertJ / JUnit failures (`expected: <x> but was: <y>`, `Expecting … to be equal to …`) into the expected-vs-got card; add tests.
- `lib/diagnostics`: map `javac` / Maven compile errors (`File.java:[line,col] error: …` and `File.java:line: error:`) to editor markers.
- Breadcrumbs, palette, hints, exams, history, vault, report export: no change beyond the language list.

## 8. Verification (same bar as Go/JS/Rust)

1. `tools/verify/java.ts`: for every exercise, **solution passes** the official test and **starter fails** (but compiles) — 45/45 both ways. Run in the runner image (on lan_vm1 via `make send/run`).
2. Parity: the same 45 solutions + 45 starters through our image vs. the exported official image → identical verdicts.
3. Content checks: README/test sha256 match provenance; every placement resolves; hints 45/45.
4. Unit/integration tests: migration 007 (CHECK widened, data intact), runner outcome mapping, assertion and diagnostics parsers, exam on a Java checkpoint.
5. Browser check: a fake user runs and submits one exercise per checkpoint, starts and passes a Java mock-exam level.
6. Measure Run/Submit latency on Cloud Run; record in this document.

## 9. Implementation order (V3 step 7; each sub-step committed separately)

- **7a** Content importer + `content/java/` (README, tests, harness, starters, ExerciseRunner, placements, provenance).
- **7b** Reference solutions (45) + hints (45).
- **7c** Runner image + build script target; local Docker backend; verify 45/45 both ways; parity with the official image.
- **7d** Server: language, migration 007, exercises loader, `java.ts` runner, settings; tests.
- **7e** Web: language list, Monaco, assertion + diagnostics parsers; tests; browser check.
- **7f** Cloud Run wrapper + service (deploy of the service is part of the release deploy, with approval).

Then step 8 (formerly 7): full tests on lan_vm1, self-audit, clean-up (DEV_LOGIN, fake users), release note.

## 10. Risks

| Risk | Handling |
|---|---|
| Maven offline resolve fails on a read-only repo | copy repo to tmpfs at start; measured in 7c |
| Submit latency (JVM + Maven) | measure; fallback only with owner approval |
| Multi-class `expectedFiles` parsed wrong | builder lists ambiguous ones; hand-fixed in `meta.json`; verify catches the rest |
| A subject's starter does not compile | verify requires "starter compiles, test fails"; fixed per exercise |
| Upstream image's Maven/JDK differs from base image | versions pinned and recorded; parity run against the export |
