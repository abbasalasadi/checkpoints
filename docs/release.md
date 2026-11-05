# Release — V4 Weighted marks

Goal: marks follow the platform weight (`baseXp`), shown only as percentages. Design: `docs/01_design/08_marks.md`.
V3 closed 2026-11-04 by the owner without a deploy (record: `docs/releases/v3.0.md`); V4 then cleanup.
No deploy until the owner has tested locally (D20).

## Decisions (2026-11-04, owner)
- D35 Weights come from the program list (`baseXp` per checkpoint placement); the UI shows percentages only, never XP. Optional adds above 100%.

## Steps
1. [x] Weights: importer from list.json into placements for go/js/rust/java + `sources/weights.json`; guard
2. [x] Server: `services/marks.ts` (value % per placement, exam mark/maxMark, track progress, best exam mark); computed on read, no migration; weights stripped from every API response
3. [x] Exam result popup (finish and expiry; leaving is End exam): ring with the mark, ✓/✗ per level with its value, note above 100%
4. [x] Exam bar: current level worth % and running mark; exercise list: % per level (optional marked +); breadcrumb: % per checkpoint
5. [x] Dashboard: ring of weighted progress + best exam mark (%); exam reports show mark % and value per level
6. [x] Tests on lan_vm1: server 50/50, web 141/141

## Done when
- [x] All steps done, tests pass
- [x] Owner tested locally (D20), 2026-11-04
- [x] Deployed 2026-11-04 (owner approved) · [ ] owner tests the live site · [ ] tag `v4.0`
- [ ] Cleanup: delete the temporary `list.json` (owner reference only, never committed)

## Owner-test fixes (2026-11-05)
- [x] Go Format on Cloud Run deploys (local Go image built in cloudrun mode)
- [x] Java starters = README templates exactly; solutions fill only the method bodies; gate on the Cloud Run image 0 bad
- [x] Exams: blank start, no "Restore starting stub", output cleared on level change, refresh stays on the current level, Back/Forward locked
- [x] Delete (icon) for history (per exercise and per entry), solutions and exam reports; icon-only Open/Export
- [x] Progress popup (no red Stop) after 5 s; Sign out only in the title bar; `make kill`
- [x] Cleanup: list.json deleted (numbers kept in content/*/sources/weights.json); tsbuildinfo untracked
- Tests on lan_vm1 at the release commit: server 52/52, web 148/148
- [ ] Owner tests production, then tag v4.0
