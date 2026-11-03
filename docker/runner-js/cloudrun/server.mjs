// The Cloud Run wrapper: HTTP in front of the existing entrypoint.
//
// It deliberately does NOT reimplement grading. It writes the student's files
// somewhere, points `entrypoint.sh` at them via STUDENT_DIR — a hook the image
// already had — and reports what that script exits with. The exit code keeps
// the meaning docs/04-execution.md gives it, because the same script and the
// same harness still produce it:
//
//   0 passed · non-zero failed
//
// timeout, output_limit, oom and cancelled stay the backend's, exactly as they
// are under dockerode — see server/src/services/runner.ts.
//
// The Go sibling of this file is go-checkpoints/runner/cloudrun/main.go. It is
// written in Go because that image carries the Go toolchain; this one is Node
// because this image is alpine + nodejs and carries no compiler. The contract
// they implement is identical (docs/10-cloud-run.md §6).
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 8080);
const WORK_ROOT = "/work";
const BODY_LIMIT = 4 << 20;

// One request per instance (--concurrency=1), but the guard is cheap and makes a
// misconfiguration fail loudly rather than corrupt a grade.
let busy = false;

/**
 * Empty /tmp without removing it.
 *
 * This is not hygiene, it is correctness. Under dockerode every run got a fresh
 * container with a fresh tmpfs /tmp; here the instance is warm and /tmp
 * survives. entrypoint.sh assembles run mode into `$TMPDIR/run.js`, and the
 * harness writes its combined module to `$TMPDIR/<exercise>.mjs` — the image's
 * own comment says "keep every run on its own tmpfs so two runs of one exercise
 * can never import each other's code". A reused instance breaks that promise
 * unless it is swept.
 *
 * The identical bug in go-checkpoints let an empty submission pass whenever a
 * correct one had run before it on the same instance (docs/10-cloud-run.md
 * §10.1). Belt and braces: a per-request TMPDIR *and* this sweep, before and
 * after every run.
 */
function wipeTmp() {
  let entries;
  try {
    entries = fs.readdirSync("/tmp");
  } catch {
    return;
  }
  for (const name of entries) {
    try {
      fs.rmSync(path.join("/tmp", name), { recursive: true, force: true });
    } catch {
      /* another uid's leftovers are not ours to remove; ignore */
    }
  }
}

/**
 * The instance's cumulative OOM-kill count, or -1 if it cannot be read.
 *
 * The dockerode path reads State.OOMKilled off the container, because a
 * killed child can leave the parent exiting non-zero — without that check an
 * out-of-memory submission is graded as a wrong answer. There is no container
 * here, so the counter is read directly. Cloud Run gen2 exposes cgroup **v1**,
 * so this is memory.oom_control, not v2's memory.events.
 *
 * Attributable to a single request because --concurrency=1 and the busy flag
 * mean only one run is ever in flight.
 */
function oomKills() {
  try {
    const text = fs.readFileSync("/sys/fs/cgroup/memory/memory.oom_control", "utf8");
    for (const line of text.split("\n")) {
      if (line.startsWith("oom_kill ")) {
        const n = Number.parseInt(line.slice("oom_kill ".length).trim(), 10);
        if (Number.isFinite(n)) return n;
      }
    }
  } catch {
    /* not readable on this platform */
  }
  return -1;
}

/**
 * Same allow-list discipline runner.ts applies before handing files to a
 * container: nothing may escape the request's own directory.
 */
function writeFiles(dir, files) {
  const names = Object.keys(files ?? {});
  if (names.length === 0) throw new Error("no files");
  for (const rel of names) {
    const target = path.resolve(dir, rel);
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      throw new Error(`illegal path: ${rel}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(files[rel] ?? ""), "utf8");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleRun(req, res) {
  if (busy) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("instance busy\n");
    return;
  }
  busy = true;

  let dir = null;
  try {
    let body;
    try {
      body = JSON.parse((await readBody(req)).toString("utf8"));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`bad request: ${err.message}\n`);
      return;
    }

    const exercise = String(body.exercise ?? "");
    if (!exercise || /[/\\]/.test(exercise)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("bad exercise\n");
      return;
    }

    fs.mkdirSync(WORK_ROOT, { recursive: true });
    dir = fs.mkdtempSync(path.join(WORK_ROOT, "run-"));
    // Anything the harness scratches goes inside the request's own directory and
    // dies with it. See wipeTmp above.
    const tmp = path.join(dir, "tmp");
    fs.mkdirSync(tmp, { recursive: true });

    wipeTmp();

    try {
      writeFiles(dir, body.files);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`files: ${err.message}\n`);
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    const emit = (obj) => {
      res.write(`${JSON.stringify(obj)}\n`);
    };

    // Exactly the environment server/src/services/runner.ts builds for the
    // container, plus STUDENT_DIR and TMPDIR. Getting this wrong produces
    // confident nonsense, so it is kept in the same order and shape as there.
    const editorFiles = Array.isArray(body.editorFiles) ? body.editorFiles : [];
    const expectedFiles = Array.isArray(body.expectedFiles)
      ? body.expectedFiles
      : body.expectedFile
        ? [body.expectedFile]
        : [];
    const env = {
      ...process.env,
      STUDENT_DIR: dir,
      EXERCISE: exercise,
      FILE: expectedFiles.join(","),
      EDITOR_FILES: editorFiles.join(","),
      CODE_EDITOR_RUN_ONLY: body.mode === "run" ? "true" : "false",
      TMPDIR: tmp,
    };

    const args = Array.isArray(body.args) ? body.args.map(String) : [];
    const oomBefore = oomKills();
    const startedAt = Date.now();

    // Own process group, so a runaway child tree can be killed as a unit if the
    // client disconnects — the analogue of `docker kill` under dockerode.
    const child = spawn("/app/entrypoint.sh", args, { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });

    let finished = false;
    const killTree = () => {
      if (finished || !child.pid) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };
    // The client going away must not leave a test run burning CPU on a warm
    // instance that will serve someone else next.
    res.on("close", () => {
      if (!finished) killTree();
    });

    // Docker multiplexed stdout and stderr onto one socket and the student saw
    // them interleaved; the same is true here because both pipe into one stream.
    const onChunk = (buf) => emit({ type: "output", text: buf.toString("utf8") });
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    const exitCode = await new Promise((resolve) => {
      child.on("error", () => resolve(-1));
      child.on("close", (code, signal) => resolve(signal ? -1 : (code ?? -1)));
    });
    finished = true;

    emit({
      type: "done",
      exitCode,
      durationMs: Date.now() - startedAt,
      // The backend maps this exactly as it maps State.OOMKilled today: oom wins
      // over whatever the exit code would otherwise suggest.
      oomKilled: oomKills() > oomBefore,
    });
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`wrapper: ${err.message}\n`);
    } else {
      try {
        res.write(`${JSON.stringify({ type: "done", exitCode: -1, error: String(err) })}\n`);
      } catch {
        /* connection already gone */
      }
      res.end();
    }
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    wipeTmp();
    busy = false;
  }
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }
  if (req.url !== "/run") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found\n");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("POST only\n");
    return;
  }
  void handleRun(req, res);
});

// A run may legitimately take the backend's full timeout; Cloud Run's own
// --timeout is the outer bound. Node's 2-minute default would cut it first.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

server.listen(PORT, () => console.log(`runner wrapper listening on :${PORT}`));
