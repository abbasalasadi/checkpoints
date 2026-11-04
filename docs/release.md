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
6. [ ] Tests on lan_vm1, self-audit, release note draft

## Done when
- [ ] All steps done, tests pass, audit pass
- [ ] Owner tested locally (D20)
- [ ] Deployed after the owner's test (with approval); tagged `v4.0`
- [ ] Cleanup: delete the temporary `list.json` (owner reference only, never committed)
