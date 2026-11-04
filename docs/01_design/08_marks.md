# 08 — Marks (V4)

Owner requirement, 2026-11-04. The reboot01 platform weighs every checkpoint
exercise with `baseXp`. Marks, progress and exam results follow that weight,
not the count. None of the three old sites did this.

**Rule: XP never appears in the UI. Everything is a percentage.**

## Source of truth
`list.json` (owner reference: Go, JS, Rust, Java modules). For each checkpoint
node (`parentType: exam`), every child has `baseXp` and `category`
(`required` | `optional` | `bonus`).

- The weight belongs to the **placement** (checkpoint × exercise), not the
  exercise: `digitlen` is 10200 in Go CP1 and 17400 in Go CP2.
- Inside a checkpoint the weight grows with the level (1×, 2×, 3×, 4× a step).
  Optional sits one step higher.

## Definitions
For one checkpoint:
- **Required weight `R`** = the sum, over the required levels, of the weight
  of one exercise at that level. (Exercises at the same level share a weight;
  if not, take the level's maximum. The importer reports any mismatch.)
- **Exercise value** = `weight / R × 100`, rounded to one decimal. Example,
  Java CP1: L1 10%, L2 20%, L3 30%, L4 40%, optional 50%.
- **Exam mark** = the sum of the values of the exercises passed in the exam.
  Required levels add up to 100%; optional or bonus adds on top (e.g. 150%,
  160%).
- **Practice progress (per track)** = Σ best value of the passed exercises ÷
  Σ best value of all exercises (each exercise counted once, at its highest
  value across checkpoints). 0–100%: 100% means every exercise solved.

## Steps
1. **Import.** `tools/` reads `list.json` and maps each checkpoint child to
   our slug (same name map as D34) → adds `weight` and `category` to
   `content/<lang>/index.json` placements for all four tracks. The guard
   fails on unmapped or missing exercises. `list.json` is removed only after
   this is committed (it is still deleted in the V3 cleanup; V4 keeps a
   copy of the extracted numbers in `content/*/sources/weights.json`).
2. **Server.** `server/src/services/marks.ts`: per-placement `value`, exam
   `mark`/`maxMark`, track `progress`. Marks are computed from the exam items
   on read, so no migration and past exams get a mark at once. No XP in any
   API response; only percentages.
3. **API.**
   - Exercise list / detail: `value` per checkpoint placement.
   - Exam view: `value` per item, `mark`, `maxMark` (100 + optional).
   - Dashboard: per track `progress` (percent) and `bestExamMark` (percent).
4. **Exam result popup.** On finish, on timer expiry and on leaving (abandon):
   a modal with the mark as a large ring (same SVG style as the dashboard),
   one line per level (✓/✗, its value), a note when optional pushed it above
   100%, and buttons: Report, Back to dashboard. Reopenable from the exam
   history.
5. **Exam page.** Each item shows its value (e.g. "L3 · 30%"); the header shows
   the running mark.
6. **Exercise page.** The value next to the level badge; an exercise in several
   checkpoints shows each (e.g. "CP1 20% · CP2 15%").
7. **Dashboard.** Donut outer ring = practice progress %, inner ring = best
   exam mark (rings go past full when over 100%; the label shows the number).
   "Best exam 160%" instead of "3 / 5".
8. **History / report.** Exam rows and the Markdown report show the mark %.
9. **Tests.** Unit: value maths (rounding, optional > 100%, missing weight).
   Server: migration 008 and back-fill. Web: popup, value labels. Gates on
   lan_vm1 as in V3.

## Open choices (defaults used unless the owner says otherwise)
- Practice progress: an exercise in several checkpoints counts at its highest
  weight.
- Go's single `bonus` exercise is treated like optional.
- JS CP2's 50-XP repeats are kept as listed (about 0% each).
- Mock exam: the optional level is offered like the other levels; the student
  may skip it.
- Rounding: one decimal in the UI ("33.3%"), totals summed before rounding.
