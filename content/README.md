# content/

Exercise content for the three languages. Each language keeps its reference's
own file layout inside `exercises/<slug>/`; only `index.json` is shared in shape.

```
content/
  <lang>/                      go | js | rust
    index.json                 schema below
    exercises/<slug>/          one directory per exercise (files per language below)
    sources/                   go, js: upstream provenance + test harness
    README.md                  go only: the reference's provenance notes, verbatim
```

| lang | exercises | placements | checkpoints (placements each)                         |
|------|-----------|------------|-------------------------------------------------------|
| go   | 60        | 213        | 1 (38), 2 (50), 3 (57), retest (10), final (58)       |
| js   | 29        | 73         | 1 (10), 2 (14), 3 (20), final (29)                    |
| rust | 40        | 77         | 1 (10), 2 (15), 3 (22), final (30)                    |

## Files per exercise

- **go** — `meta.json`, `README.md`, `starter.go`, `solution.go`, `test.go`, and `main.go`
  for function exercises. Tests compile against `go/sources/test-go/` (01-edu harness).
- **js** — `meta.json`, `README.md`, `starter.js`, `solution.js`, `test.js`, `main.js`.
  Tests run under `js/sources/harness/test.mjs` (module-js image's `test.mjs`).
- **rust** — `meta.json`, `README.md`, `starter.rs`, `solution.rs`, `test.rs`, `main.rs`.
  Cargo manifests are generated from `meta.json` (edition, deps, testShape).

Imported verbatim from the go-checkpoints and js-checkpoints reference repos
(`content/exercises`, `content/sources`); the JS harness from
`runner/image/test.mjs`. `meta.json` paths such as `content/sources/...` or
`tools/authored/...` are provenance and refer to the reference repos.

## index.json schema (v1, all languages)

```jsonc
{
  "schema": 1,
  "language": "go" | "js" | "rust",
  "meta": { ... },              // language provenance; {} for rust
  "exercises": [
    {
      "slug": "addprimesum",      // directory name under exercises/
      "language": "go",
      "kind": "func" | "prog"     // go
            | "func"              // js (from meta.test.mode = "function")
            | "lib"  | "bin",     // rust
      "argv": true,               // program takes command-line args (js: always false)
      "dir": "exercises/addprimesum",
      ...                         // every other field the reference index carried
    }
  ],
  "placements": [
    {
      "exercise": "addprimesum",  // slug
      "checkpoint": "1" | "2" | "3" | "retest" | "final",   // retest: go only
      "level": 5,
      "order": 35,                // position within the checkpoint; null for rust (not recorded upstream)
      ...                         // go/js: index, baseXp, category, difficulty, platformId, ...
    }
  ]
}
```

Level belongs to the placement, not the exercise: one exercise can sit at
different levels in different checkpoints. Placements are sorted by checkpoint
(1, 2, 3, retest, final), then level, order, slug.

`npx tsx tools/content-index.ts [--lang L] [--check]` rewrites the indexes into
this shape (idempotent; `--check` only reports).

## Verifying

`npx tsx tools/verify.ts --lang go|js|rust [--only slug,slug]` — every solution
passes its test and every starter fails it, using local `go` / `node` / `cargo`
in scratch trees under `var/verify/<lang>/`. Go pins `GOTOOLCHAIN=go1.25.12`.
