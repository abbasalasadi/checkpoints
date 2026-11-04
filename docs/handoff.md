# Handoff — 2026-11-04

**Next action:** V3 step 7f — Cloud Run wrapper for the Java runner image (as for Go/JS; min-instances 0, small max cap) and its settings; deploy only with the owner's approval as part of the release. Then step 8 (lan_vm1 full tests, self-audit, remove DEV_LOGIN, delete fake users fake_v3_ui/fake_exam_ui with their exams, release note).

**State:** Java 7a-7e committed and pushed. 44 exercises (program list.json, D34). Image gate: `tools/java-image-check.sh` on lan_vm1 (build first: `node scripts/build-runner-images.mjs --only java`, ~3.5 min cold); laptop quick loop: `tools/java-check.sh <slug> [solution|starter]`. Importer: `node --experimental-strip-types tools/java-content.ts` (holds PLACEMENTS, EXPECTED_FILES, RUNNER_FIXES).

**Notes:**
- Local DB backup before migration 007: var/db/app.pre007.bak (local only).
- Local laptop has no Java image, so Run/Submit for Java work only on lan_vm1 / Cloud Run.
- Production needs migrations 006 and 007 at the next deploy (back up the DB first).
- list.json (owner's program export) is in the repo root, untracked.
