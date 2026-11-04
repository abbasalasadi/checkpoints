# Release — V3 Exam and extras

Goal: a student can rehearse a timed checkpoint and get help without being handed the answer.
No deploy until the owner has tested locally (D20). Old sites are not touched until after V3 (D21).

## Decisions (2026-11-04, owner)
- D27 Mock exam results are separate: shown in the exam report and history, never mark practice progress.
- D28 Exam rules like the real exam: no hints, no Solutions page, no other exercises until the exam ends or is abandoned.
- D29 Hints (129, one line each, D4) ship as written, no owner review; fixes when reported.
- Font controls already exist (V2 Preferences); dropped from V3 feature 5.

## Steps
1. [x] Mock exam server: exam table + migration, start (one random exercise per level, pristine starters, practice drafts set aside server-side, D7), timer (default 3 hours, set in hours as "Time"), submit, end/abandon, report; rules enforced server-side (D28)
2. [x] Mock exam web: start screen, locked workbench with timer, report page, history entries
3. [x] Hints: 129 one-line hints in content, API, 10-second reveal delay, hidden during exams
4. [x] Assertion diff card on failed tests (expected vs actual)
5. [x] Command palette + keyboard shortcut sheet
6. [x] Focus (zen) mode, post-pass "next exercise" prompt, breadcrumbs
7. [x] Java track (D30–D34; 44 exercises; Cloud Run service created at deploy), design in `docs/01_design/07_java_track.md`: 7a content importer, 7b solutions + hints, 7c runner image + verify/parity, 7d server + migration 007, 7e web, 7f Cloud Run service
8. [x] Tests on lan_vm1, self-audit, clean-up (DEV_LOGIN, fake users), release note draft (`docs/releases/v3.0.md`)

## Done when
- [x] All steps done, tests pass, audit pass
- [ ] Dashboard redesign (owner, 2026-11-04): per track a donut of exercises passed plus best exam (e.g. 3/5); no checkpoint rows, no run counts
- [x] Owner tested locally (D20), 2026-11-04
- [ ] Deployed after the owner's test; tagged `v3.0`, release note written
- [ ] Cleanup: delete the temporary `list.json` (owner reference only, never committed)
