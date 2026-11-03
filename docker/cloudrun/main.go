// The Cloud Run wrapper: HTTP in front of cargo.
//
// It reproduces what server/src/routes/index.ts does per run — materialise the
// student's files, then `cargo test` in <slug>_test or `cargo run` in <slug> —
// and reports the exit code, which is what decides pass/fail. Nothing about the
// verdict model changes; only where the process runs.
//
// THE ONE THING THAT CANNOT COME ACROSS is the per-user /workspace volume.
// docker/runner/Dockerfile explains why a shared CARGO_TARGET_DIR is not an
// option: the outer `cargo test` and the inner `cargo run` of the four
// recursive suites contend on the same build-directory lock and hang. So every
// request here gets its own workspace and therefore builds COLD. On the VM a
// student's target/ persists between runs and docs/04-runner.md measures that
// as ~4s cold vs ~0.5s warm. That gap is the price of this design, and
// measuring it is the entire point of tools/measure-runner.mjs.
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

type file struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type runRequest struct {
	Exercise string   `json:"exercise"`
	Kind     string   `json:"kind"` // "test" | "run"
	Files    []file   `json:"files"`
	Args     []string `json:"args"`
}

const workRoot = "/work"

// One request per instance (--concurrency=1); the guard makes a
// misconfiguration fail loudly rather than corrupt a grade.
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
	log.Printf("rust runner wrapper listening on :%s", port)
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
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&req); err != nil {
		http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Exercise == "" || strings.ContainsAny(req.Exercise, "/\\") {
		http.Error(w, "bad exercise", http.StatusBadRequest)
		return
	}
	if req.Kind != "test" && req.Kind != "run" {
		http.Error(w, "kind must be test or run", http.StatusBadRequest)
		return
	}

	dir, err := os.MkdirTemp(workRoot, "run-")
	if err != nil {
		http.Error(w, "workdir: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Nothing a request creates may outlive it. Instances are reused, and two
	// students' crates share a package name — leaving one's build products for
	// the next is the same class of bug that let an empty starter pass in
	// go-checkpoints and js-checkpoints.
	defer func() { _ = os.RemoveAll(dir) }()

	if err := writeFiles(dir, req.Files); err != nil {
		http.Error(w, "files: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	enc := json.NewEncoder(w)
	var mu sync.Mutex
	emit := func(v any) {
		mu.Lock()
		_ = enc.Encode(v)
		if flusher != nil {
			flusher.Flush()
		}
		mu.Unlock()
	}

	// Exactly the commands routes/index.ts issues, including --color always so
	// cargo's diagnostics keep the formatting a student sees today.
	var args []string
	var cwd string
	if req.Kind == "test" {
		args = []string{"test", "--offline", "--color", "always"}
		cwd = filepath.Join(dir, req.Exercise+"_test")
	} else {
		args = append([]string{"run", "--offline", "--color", "always", "--"}, req.Args...)
		cwd = filepath.Join(dir, req.Exercise)
	}

	oomBefore := oomKills()
	started := time.Now()

	cmd := exec.Command("cargo", args...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "CARGO_NET_OFFLINE=true")
	// Own process group: the four recursive suites spawn cargo again, and a
	// client disconnect must take the whole tree with it.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		emit(map[string]any{"type": "done", "exitCode": -1, "error": err.Error()})
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		emit(map[string]any{"type": "done", "exitCode": -1, "error": err.Error()})
		return
	}
	if err := cmd.Start(); err != nil {
		emit(map[string]any{"type": "done", "exitCode": -1, "error": err.Error()})
		return
	}

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
	stream := func(rc io.Reader) {
		defer wg.Done()
		buf := make([]byte, 8192)
		for {
			n, err := rc.Read(buf)
			if n > 0 {
				emit(map[string]any{"type": "output", "text": string(buf[:n])})
			}
			if err != nil {
				return
			}
		}
	}
	wg.Add(2)
	go stream(stdout)
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
	emit(map[string]any{
		"type":       "done",
		"exitCode":   exitCode,
		"durationMs": time.Since(started).Milliseconds(),
		"oomKilled":  oomKills() > oomBefore,
	})
}

// Cloud Run gen2 exposes cgroup v1, so this is memory.oom_control rather than
// v2's memory.events — the same finding as go-checkpoints §10.1.
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

func writeFiles(dir string, files []file) error {
	if len(files) == 0 {
		return fmt.Errorf("no files")
	}
	for _, f := range files {
		target := filepath.Clean(filepath.Join(dir, f.Path))
		if !strings.HasPrefix(target, dir+string(os.PathSeparator)) {
			return fmt.Errorf("illegal path: %s", f.Path)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target, []byte(f.Content), 0o644); err != nil {
			return err
		}
	}
	return nil
}
