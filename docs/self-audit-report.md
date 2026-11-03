# Self-Audit — <project> v<n>.0

| Project | Version | Commit | Date | Reviewer role |
|---|---|---|---|---|
| <project> | V<n> | <hash> | <date> | reviewer (not the builder) |

Scope: `docs/release.md` at this commit. Method: `procedures/self-audit.md`. Findings follow `audit_methodology.md` §11.

## Verdict
<Pass — ready to tag | Fail — n blocking findings>

## Fixed checks
| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Runs from a clean checkout | pass / fail | <log path> |
| 2 | Tests pass (collected <n> of <expected>, no new skips) | | |
| 3 | Secret scan clean | | |
| 4 | Really deployed / installed | | |
| 5 | Every `release.md` feature present and working | | <per feature below> |
| 6 | Nothing outside `release.md` built | | |
| 7 | Records current (`status.md`, `handoff.md`, `decisions.md`) | | |

## Features
| Feature | How checked | Result |
|---|---|---|
| <feature> | <steps> | works / broken / missing |

## Findings
### F1 — <title>
- **Severity:** blocking / minor
- **Rule:** <file#anchor, at level V<n>>
- **Evidence:** <path, command output, screenshot>
- **Impact:** <one line>
- **Fix:** <one line>
- **Goes to:** `release.md` step <n> | V<n+1> in `versions.md`

## Not findings
<later-version features absent by design; rules above the current level>
