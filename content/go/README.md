# content/

The canonical source of truth for every Go checkpoint exercise: one directory
per exercise holding the subject, the official test, the reference solution and
a generated starter. Nothing downstream should reach past this folder into the
tester image or the campus tree.

```
content/
  index.json                        every exercise + every placement
  exercises/<slug>/
    meta.json                       provenance, entry points, placements
    README.md                       the subject, verbatim from 01-edu/public
    starter.go                      what the student receives
    main.go                         runnable demo (function exercises only)
    solution.go                     reference answer, verbatim from the tester
    test.go                         official test, verbatim from the tester
  sources/
    reboot-graphql.json             raw object / object_child rows from the platform API
    reboot-piscine-go-snapshot.json the resolved tree's five exam nodes, for readability
    test-go/                        the shared test harness the tests compile against
      go.mod  go.sum  entrypoint.sh
      lib/{base,challenge,chars,is,random}/
```

**60 exercises, 213 placements** — checkpoint-01 (38), checkpoint-02 (50),
checkpoint-03 (57), re-test (10) and the final (58).

Four of the five are piscine exams under `/bahrain/bh-piscine`; the final is a
module exam under `/bahrain/bh-module`. `tools/go-exams.py` finds them by
looking for exams whose exercises are Go, so there is no root to keep in sync.

## Two placement sources, and why

Placement data has two upstream forms and the build uses both.

The **raw rows** — `object` and `object_child` from
`learn.reboot01.com/api/graphql-engine/v1/graphql`, vendored as
`sources/reboot-graphql.json` — are authoritative for structure: which exercise
sits at which level in which checkpoint, its order, whether it is required or
optional, its expected files and allowed functions. What they do *not* carry is
anything the platform computes. Half the interesting attributes are unevaluated
thunks:

```json
"subject":       {"name": "getSubject",       "type": "function"},
"validations":   [{"type": "tester", "cooldown": 180000,
                   "testImage": {"name": "getTesterImage", "type": "function"}}],
"difficultyMod": {"name": "getDifficultyMod", "type": "function"}
```

and `baseXp`, `difficulty`, `level` and `xpIndex` are not present at all.

The **resolved tree** — `reboot_index.json`, the platform's own render of the
same graph — has those thunks evaluated, and is therefore authoritative for the
subject path, the tester image, the cooldown, `baseXp` and `difficulty`. Those
five are listed in `meta.platform.resolvedFields`; nothing cross-checks them.

Everything else is compared field by field at build time — **1975 fields across
213 placements, zero disagreements** — and the build fails on any mismatch, so
neither source can drift unnoticed. `index.json`'s `meta.placementSource
.crossCheck` records the last run.

Two things the raw rows settled that would otherwise have been assumptions: the
per-placement `group` attribute is the exam level (155/155 agreement, and each
exam's `maxGroup` equals its distinct level count), and `repeatealpha` is a typo
in a checkpoint-03 *edge key* — the object it points at is named `repeatalpha`.
The alias list is derived from that disagreement rather than hand-written.

## The data model

**Level belongs to the placement, not the exercise.** `printrevcomb` is level 3
in checkpoint-01 and level 4 in checkpoints 02 and 03; `wdmatch` is level 5 in
checkpoints 02 and 03 and level 6 in the re-test. A `level` field on the exercise
record would be wrong for those two and misleading for the rest. The same holds
for `baseXp` (it grows with every checkpoint), `category`, `index`/`order` and —
for `addprimesum` — `allowedFunctions`.

Exercises come in two kinds, decided by the platform's `expectedFiles`:

| kind | expectedFiles | student writes | test calls |
|---|---|---|---|
| `func` (34) | `<slug>.go` | an exported function in `package piscine` | `challenge.Function(...)`, or a hand-rolled table |
| `prog` (26) | `<slug>/main.go` | a `package main` program | `challenge.Program(...)` — diffs stdout/exit against the reference program |

`meta.entry` is read out of the test file (`student.Gcd` → `["Gcd"]`), not out of
the subject: the test is the real contract and exists for all 60, the subject's
signature block does not.

## Provenance

| Artifact | Source |
|---|---|
| `README.md` | `01-edu/public@13cd08c1` `subjects/<slug>/README.md` |
| `test.go` | `ghcr.io/01-edu/module-go` `/test-go/tests/<slug>_test/main.go`, verbatim |
| `solution.go` | `ghcr.io/01-edu/module-go` `/test-go/solutions/<slug>{.go,/main.go}`, verbatim |
| `sources/test-go/lib/` | same image, verbatim |
| placement structure | reboot01 GraphQL, `object` / `object_child` under `/bahrain/bh-piscine` |
| XP, difficulty, subject path, tester image | `reboot_index.json`, the platform's resolved tree |
| `starter.go`, `main.go` | generated from the subject |

The exam nodes name `ghcr.io/01-edu/test-go` as the test image. That repository
is a stale go1.18 build; `module-go` is the image actually in service. Both lay
out `/test-go` identically.

`sources/module-go-image.json` is that image's own config — Go version, entrypoint,
workdir, layer digests, and the build history. `tools/fetch-upstream.sh` is pinned
to the digest recorded there, so re-pulling is a deliberate act rather than
whatever `latest` happens to be.

## What is generated, and what upstream does not ship

`starter.go` is derived from the subject's `### Expected function` block with the
body emptied (`package piscine` prepended), or is the empty `main` skeleton for
program exercises.

`main.go` is the subject's `### Usage` demo. Roughly half the subjects call the
function bare (`CountAlpha(...)`) rather than through the package, so the calls
are qualified and the `"piscine"` import declared; `meta.mainFrom` records which
transform ran. `subjects/fromto` misspells its import as `"psicine"` — repaired.

### Adapted solutions

A third source, alongside upstream and authored: **`adapted`** — upstream ships a
solution, but one its own exercise forbids. `onlya` allows
`github.com/01-edu/z01.PrintRune` and the builtins, and upstream's answer is
`fmt.Print("a")`. The tester never puts its own solutions through `rc`, so it
never had reason to notice; a reference a student cannot submit is not much of a
reference.

An adapted solution keeps upstream's behaviour byte for byte and changes only how
it gets there. `meta.solution.source` is `adapted` and `.replaces` names the file
it stands in for, so nothing is silently substituted.

Five artifacts are **authored locally** because the tester image does not have
them. They are marked `"source": "authored"` in `meta.json` and their sources
live in `tools/authored/`:

| Exercise | Missing upstream |
|---|---|
| `cleanstr`, `expandstr`, `searchreplace` | `solutions/<slug>/` — the test exists and calls `challenge.Program`, but there is no reference program to diff against, so these three exercises cannot currently be graded on the platform either |
| `printnbrbase` | both the solution and the test |

Each authored solution is checked against its own subject's documented console
output by `tools/verify-content.mjs --usage`.

## The two platform gates

Before it runs a single test, the tester's entrypoint puts a submission through
`gofumpt -l -w .` and rejects it outright if anything comes back rewritten, then
runs `rc` to check it only calls the functions the exercise allows. The content
pipeline uses those same two binaries (installed into `var/upstream/bin/` by
`tools/fetch-upstream.sh`) so it cannot ship anything the platform would bounce.

**Formatting.** Every generated `starter.go` and `main.go` is passed through
gofumpt on the way out, and the acceptance gate re-checks all 93 of them. This
mattered: the subjects print their signature blocks with a blank line inside the
body, and three of them indent the demo with spaces instead of tabs — either
would have handed the student code that fails the format gate before they typed
anything.

**Allowed functions.** `meta.solution.passesRc` records whether the reference
solution would survive `rc` under the exercise's own `allowedFunctions`, with
the specific violations in `rcFindings`. **25 of 60 would not** — `onlya`'s
official solution calls `fmt.Print` when the exercise permits only
`z01.PrintRune`. That is not a bug upstream: the tester's solutions run inside
the harness and are never submitted. But anything that shows a solution to a
student has to say so, or it is handing out an answer the platform rejects.

## Caveats

- `addprimesum` and `findprevprime` solutions import the tester's own
  `lib/is` for a primality check, so they are not drop-in answers a student
  could submit. `meta.solution.harness` records this.
- Function solutions are stored with their upstream `package solutions` clause.
  Serving one as a reference answer means rewriting that line to `package
  piscine`; `meta.solution.package` records what is there.
- An exercise directory holds several files that declare different packages and
  two that declare `func main`. That is deliberate — this is a content store,
  not a Go module. There is no `go.mod` under `content/`, so `go build ./...`
  never sees them; editors will flag them.

## Rebuilding

```sh
tools/fetch-upstream.sh                  # subjects + tester image -> var/upstream/
tools/fetch-placements.sh                # reboot01 GraphQL rows -> var/upstream/reboot/
node tools/build-content.mjs             # -> content/
node tools/verify-content.mjs --usage    # acceptance gate
```

`fetch-placements.sh` needs platform credentials, which it reads from
`~/Documents/my_reboot/.env` (override with `REBOOT_ENV_FILE`); the JWT lives in
a `0600` temp file for the life of the run and is never written to the repo.
Without it the build falls back to the vendored `sources/reboot-graphql.json`,
so a checkout rebuilds byte-identically on a machine with no credentials.

The gate reassembles a throwaway tester workspace from `content/` alone and runs
all 60 official tests with the reference solution standing in for the student,
checks every generated file is gofumpt-clean, checks that every `starter.go`
parses and every `main.go` builds and runs, then replays the authored solutions
against their subject's documented output.
