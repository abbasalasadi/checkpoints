# Handoff — 2026-11-04

**Next action:** V3 step 8 — lan_vm1 full tests (with a preflight: create var/, check images, smoke one case first), self-audit, remove DEV_LOGIN, delete fake users fake_v3_ui/fake_exam_ui with their exams, release note. Then the owner's local test; deploy only with approval: DB backup, migrations 006+007, create the Java Cloud Run service from docker/runner-java/cloudrun (min 0, small max, concurrency 1, ~1 GiB) and set RUNNER_JAVA_CLOUDRUN_URL in .env.vm.

**State:** Java 7a-7e committed and pushed. 44 exercises (program list.json, D34). Image gate: `tools/java-image-check.sh` on lan_vm1 (build first: `node scripts/build-runner-images.mjs --only java`, ~3.5 min cold); laptop quick loop: `tools/java-check.sh <slug> [solution|starter]`. Importer: `node --experimental-strip-types tools/java-content.ts` (holds PLACEMENTS, EXPECTED_FILES, RUNNER_FIXES).

**Notes:**
- Local DB backup before migration 007: var/db/app.pre007.bak (local only).
- Local laptop has no Java image, so Run/Submit for Java work only on lan_vm1 / Cloud Run.
- Production needs migrations 006 and 007 at the next deploy (back up the DB first).
- list.json (owner's program export) is in the repo root, untracked.
