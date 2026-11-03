// The Cloud Run wrapper: HTTP in front of the existing entrypoint.
//
// It deliberately does NOT reimplement grading. It writes the student's files
// somewhere, points `entrypoint.sh` at them via STUDENT_DIR, and reports what
// that script exits with. The six container exit codes keep the meaning
// docs/04-execution.md gives them, because the same script still produces them:
//
//	0 passed · 1 failed · 10 unformatted · 11 forbidden · 12 build_error · 13 missing_file
//
// timeout, output_limit, oom and error stay the backend's, exactly as they are
// under dockerode — see server/src/services/runner.ts.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type runRequest struct {
	Exercise         string            `json:"exercise"`
	Mode             string            `json:"mode"`
	Files            map[string]string `json:"files"`
	Args             []string          `json:"args"`
	AllowedFunctions []string          `json:"allowedFunctions"`
	ExpectedFile     string            `json:"expectedFile"`
	EditorFiles      []string          `json:"editorFiles"`
}

const workRoot = "/work"

// One request per instance (--concurrency=1), but the guard is cheap and makes
// a misconfiguration fail loudly rather than corrupt a grade.
var busy sync.Mutex

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ok\n")
	})
	http.HandleFunc("/run", handleRun)
	log.Printf("runner wrapper listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	if !busy.TryLock() {
		http.Error(w, "instance busy", http.StatusServiceUnavailable)
		return
	}
	defer busy.Unlock()

	var req runRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&req); err != nil {
		http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Exercise == "" || strings.ContainsAny(req.Exercise, "/\\") {
		http.Error(w, "bad exercise", http.StatusBadRequest)
		return
	}

	dir, err := os.MkdirTemp(workRoot, "run-")
	if err != nil {
		http.Error(w, "workdir: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// §8.1: instances are reused, so nothing a request creates may outlive it.
	//
	// This is not hygiene, it is correctness. Under dockerode every run got a
	// fresh container with a fresh tmpfs /tmp; here the instance is warm and /tmp
	// survives. The 01-edu harness caches the student's compiled binary under
	// TMPDIR, so without this an empty submission "passed" whenever a correct one
	// had run before it on the same instance — verified 2026-09-09.
	//
	// GOCACHE lives at /gocache and is deliberately NOT touched: it is
	// content-addressed, so it cannot leak a verdict, and it is the warmth that
	// makes a reused instance faster than a fresh container.
	tmp := filepath.Join(dir, "tmp")
	if err := os.MkdirAll(tmp, 0o777); err != nil {
		http.Error(w, "tmpdir: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() {
		_ = os.RemoveAll(dir)
		_ = os.RemoveAll("/piscine-go")
		wipeTmp()
	}()
	wipeTmp()

	if err := writeFiles(dir, req.Files); err != nil {
		http.Error(w, "files: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)

	enc := json.NewEncoder(w)
	emit := func(v any) {
		_ = enc.Encode(v)
		if flusher != nil {
			flusher.Flush()
		}
	}

	env := append(os.Environ(),
		"STUDENT_DIR="+dir,
		"EXERCISE="+req.Exercise,
		"FILE="+req.ExpectedFile,
		"ALLOWED_FUNCTIONS="+strings.Join(req.AllowedFunctions, " "),
		// Anything the toolchain or the harness scratches goes inside the request's
		// own directory, and dies with it. See the wipeTmp comment above.
		"TMPDIR="+tmp,
	)
	if req.Mode == "run" {
		env = append(env,
			"CODE_EDITOR_RUN_ONLY=true",
			"EDITOR_FILES="+strings.Join(req.EditorFiles, ","),
		)
	}

	cmd := exec.Command("/usr/local/bin/entrypoint.sh", req.Args...)
	cmd.Env = env
	// Own process group, so a runaway child tree can be killed as a unit if the
	// client disconnects — the analogue of `docker kill` under dockerode.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	pipe, err := cmd.StdoutPipe()
	if err != nil {
		emit(map[string]any{"type": "done", "exitCode": -1, "error": err.Error()})
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		emit(map[string]any{"type": "done", "exitCode": -1, "error": err.Error()})
		return
	}

	// The dockerode path reads State.OOMKilled off the container for ANY non-zero
	// exit, because `go run` survives its child being killed and exits 1 — without
	// that check an out-of-memory submission is graded as a wrong answer
	// (server/src/services/runner.ts). There is no container here, so the counter
	// is read directly. Cloud Run gen2 exposes cgroup **v1**, so this is
	// memory.oom_control, not v2's memory.events.
	oomBefore := oomKills()

	started := time.Now()
	if err := cmd.Start(); err != nil {
		emit(map[string]any{"type": "done", "exitCode": -1, "error": err.Error()})
		return
	}

	// The client going away must not leave a compiler running on a warm instance.
	done := make(chan struct{})
	go func() {
		select {
		case <-r.Context().Done():
			if cmd.Process != nil {
				_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			}
		case <-done:
		}
	}()

	var wg sync.WaitGroup
	var mu sync.Mutex
	stream := func(rc io.Reader) {
		defer wg.Done()
		buf := make([]byte, 8192)
		for {
			n, err := rc.Read(buf)
			if n > 0 {
				mu.Lock()
				emit(map[string]any{"type": "output", "text": string(buf[:n])})
				mu.Unlock()
			}
			if err != nil {
				return
			}
		}
	}
	wg.Add(2)
	go stream(pipe)
	go stream(stderr)
	wg.Wait()

	err = cmd.Wait()
	close(done)

	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = -1
		}
	}
	mu.Lock()
	emit(map[string]any{
		"type":       "done",
		"exitCode":   exitCode,
		"durationMs": time.Since(started).Milliseconds(),
		// The backend maps this exactly as it maps State.OOMKilled today: oom wins
		// over whatever the exit code would otherwise suggest.
		"oomKilled": oomKills() > oomBefore,
	})
	mu.Unlock()
}

// oomKills returns the instance's cumulative OOM-kill count, or -1 if it cannot
// be read. Attributable to a single request because --concurrency=1 and the busy
// mutex mean only one run is ever in flight.
func oomKills() int {
	b, err := os.ReadFile("/sys/fs/cgroup/memory/memory.oom_control")
	if err != nil {
		return -1
	}
	for _, line := range strings.Split(string(b), "\n") {
		if rest, ok := strings.CutPrefix(line, "oom_kill "); ok {
			n := 0
			if _, err := fmt.Sscanf(rest, "%d", &n); err == nil {
				return n
			}
		}
	}
	return -1
}

// wipeTmp empties /tmp without removing it. entrypoint.sh writes /tmp/build-check
// directly, and the harness may scratch there too regardless of TMPDIR, so the
// belt-and-braces sweep runs both before and after every request.
//
// GOCACHE is at /gocache and is untouched by design.
func wipeTmp() {
	entries, err := os.ReadDir("/tmp")
	if err != nil {
		return
	}
	for _, e := range entries {
		_ = os.RemoveAll(filepath.Join("/tmp", e.Name()))
	}
}

// writeFiles is the same allow-list discipline runner.ts applies before handing
// files to a container: nothing may escape the request's own directory.
func writeFiles(dir string, files map[string]string) error {
	if len(files) == 0 {
		return fmt.Errorf("no files")
	}
	for rel, body := range files {
		target := filepath.Join(dir, rel)
		clean := filepath.Clean(target)
		if !strings.HasPrefix(clean, dir+string(os.PathSeparator)) {
			return fmt.Errorf("illegal path: %s", rel)
		}
		if err := os.MkdirAll(filepath.Dir(clean), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(clean, []byte(body), 0o644); err != nil {
			return err
		}
	}
	return nil
}
