# Release — V3 Exam and extras

Goal: a student can rehearse a timed checkpoint and get help without being handed the answer.
No deploy until the owner has tested locally (D20). Old sites are not touched until after V3 (D21).

## Decisions (2026-11-04, owner)
- D27 Mock exam results are separate: shown in the exam report and history, never mark practice progress.
- D28 Exam rules like the real exam: no hints, no Solutions page, no other exercises until the exam ends or is abandoned.
- D29 Hints (129, one line each, D4) ship as written, no owner review; fixes when reported.
- Font controls already exist (V2 Preferences); dropped from V3 feature 5.

## Steps
1. [ ] Mock exam server: exam table + migration, start (one random exercise per level, pristine starters, practice drafts set aside server-side, D7), timer (default 180 min), submit, end/abandon, report; rules enforced server-side (D28)
2. [ ] Mock exam web: start screen, locked workbench with timer, report page, history entries
3. [ ] Hints: 129 one-line hints in content, API, 10-second reveal delay, hidden during exams
4. [ ] Assertion diff card on failed tests (expected vs actual)
5. [ ] Command palette + keyboard shortcut sheet
6. [ ] Focus (zen) mode, post-pass "next exercise" prompt, breadcrumbs
7. [ ] Tests on lan_vm1, self-audit, release note draft

## Done when
- [ ] All steps done, tests pass, audit pass
- [ ] Owner tested locally (D20)
- [ ] Deployed after the owner's test; tagged `v3.0`, release note written
