# Handoff — 2026-11-04

V4 (weighted marks, D35) steps 1-6 done and pushed. Next: the owner tests locally (dashboard ring, exam result popup after End exam, % in the exercise tree / breadcrumb / exam bar). Then, with approval, deploy (the V3 Java Cloud Run service is still needed: see docs/releases/v3.0.md), tag v4.0, and clean up: delete list.json (weights are kept in content/*/sources/weights.json; re-apply with `node tools/weights.ts`).
