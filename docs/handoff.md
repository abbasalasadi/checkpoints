# Handoff

**Next action:** V3 step 7a — write `tools/java-content.ts` and generate `content/java/` per `docs/01_design/07_java_track.md` §3 (sources: the exported image `/media/abbas/Data D/00. Backup/Reboot/Master-Repos/Checkpoints/module-java-docker/app` and `public-master.zip`). Then 7b-7f in order, one commit each.

**State:** V3 steps 1-6 done and committed; owner is happy with the app. Owner deferred the full tests and clean-up (now step 8) until Java is in.
DEV_LOGIN=true is in local `.env`; fake users fake_v3_ui and fake_exam_ui exist locally (with exams) — remove both in step 8.
No deploy before the owner tests locally (D20); the deploy will carry migrations 006 and 007 and the Java Cloud Run service (approval needed).
