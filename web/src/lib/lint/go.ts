// Advisory only — rc is the authority and this is a regex over source, not a
// parser. It exists because two things fail Submit while Run succeeds, which is
// the most confusing shape a failure can take. docs/07-frontend.md.
export type Lint = { file: string; line: number; message: string }

/** Comments and strings first, so `// use fmt here` is not flagged. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`]*`/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => ' '.repeat(m.length))
}

/** `os.*` is the whole package; `fmt.Println` is that one function. */
function allows(allowed: string[], pkg: string, symbol: string): boolean {
  return allowed.some((a) => {
    if (a.startsWith('--')) return false
    const short = a.includes('/') ? a.slice(a.lastIndexOf('/') + 1) : a
    return short === `${pkg}.*` || short === `${pkg}.${symbol}` || short === pkg
  })
}

export function lint(files: Record<string, string>, allowed: string[], studentPackage?: string): Lint[] {
  const out: Lint[] = []
  for (const [file, raw] of Object.entries(files)) {
    if (!file.endsWith('.go')) continue
    const src = strip(raw)

    // The package clause. Worth its own check because getting it wrong produces
    // the single most confusing failure this app can show: Submit *passes* —
    // the tester imports the file under an alias, so the declared name never
    // has to match — while Run fails to compile with `"piscine" imported as
    // solutions and not used`, which names neither the file nor the fix.
    if (studentPackage) {
      const decl = /^\s*package\s+(\w+)/m.exec(src)
      if (decl && decl[1] !== studentPackage) {
        out.push({
          file,
          line: src.slice(0, decl.index).split('\n').length,
          message: `this file must be "package ${studentPackage}", not "package ${decl[1]}"`,
        })
      }
    }

    src.split('\n').forEach((line, i) => {
      // Legal Go, rejected outright by the tester before any test runs.
      if (/\b(?<!\.)print(ln)?\s*\(/.test(line)) {
        out.push({ file, line: i + 1, message: 'print and println are rejected before any test runs' })
      }
      for (const m of line.matchAll(/\b([a-z][a-z0-9]*)\.([A-Z]\w*)\s*\(/g)) {
        const pkg = m[1]!, symbol = m[2]!
        if (pkg === 'piscine') continue
        if (!allows(allowed, pkg, symbol)) {
          out.push({ file, line: i + 1, message: `${pkg}.${symbol} is not in this exercise's allowed list` })
        }
      }
    })
  }
  // One report per distinct message: a call in a loop is still one problem.
  const seen = new Set<string>()
  return out.filter((l) => {
    const k = `${l.file}:${l.message}`
    return seen.has(k) ? false : (seen.add(k), true)
  })
}

/** Shell-style split, so a quoted or empty argument survives. */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < input.length) cur += input[++i]
      else cur += c
    } else if (c === '"' || c === "'") {
      quote = c
      started = true
    } else if (/\s/.test(c)) {
      if (started || cur) { out.push(cur); cur = ''; started = false }
    } else {
      cur += c
    }
  }
  if (started || cur) out.push(cur)
  return out
}
