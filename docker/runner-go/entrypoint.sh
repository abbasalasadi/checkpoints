#!/bin/sh
# Ours, not upstream's — but it keeps upstream's gate order and its exact messages,
# because those are what a student meets on the real checkpoint. What it changes is
# the exit code: upstream returns 1 for a formatting rejection, a forbidden call and
# a wrong answer alike, so the backend would have to parse output to tell them apart.
#
#   0  passed          10  unformatted     12  build_error
#   1  failed          11  forbidden       13  missing_file
#
# timeout, output_limit, oom and error are the backend's — the container cannot see
# its own wall clock, output cap or OOM kill. See docs/04-execution.md.
set -e

: "${EXERCISE:?EXERCISE is required}"
STUDENT_DIR="${STUDENT_DIR:-/run/student}"

# Read-only root (V2): the warm build cache baked at /gocache cannot take new
# entries, and a cold cache costs 23x on run time. A farm of symlinks in /tmp
# keeps every warm entry readable and puts new ones on the tmpfs — no copy, so
# the 63 MB cache does not count against the container's memory.
if [ ! -w "$GOCACHE" ]; then
	RO_CACHE="$GOCACHE"
	GOCACHE=/tmp/gocache
	export GOCACHE
	mkdir -p "$GOCACHE"
	(cd "$RO_CACHE" && for d in */; do
		mkdir -p "$GOCACHE/$d"
		for f in "$d"*; do [ -e "$f" ] && ln -s "$RO_CACHE/$f" "$GOCACHE/$f"; done
	done)
	for f in "$RO_CACHE"/*; do [ -f "$f" ] && cp "$f" "$GOCACHE/"; done
fi

# The submission is copied, never run in place: /run/student is mounted read-only
# and the toolchain needs somewhere to write. /piscine-go is a sibling of /test-go
# so that `replace student => ../piscine-go` resolves with no copy of the harness.
# With a read-only root (V2 hardening) /piscine-go is its own tmpfs: a mount
# point cannot be removed, so it is emptied instead.
mkdir -p /piscine-go
find /piscine-go -mindepth 1 -delete
cp -r "$STUDENT_DIR"/. /piscine-go/ 2>/dev/null || true
cd /piscine-go

# The student never writes a go.mod — the platform runs `go mod init piscine` for
# them. The template carries the z01 requirement and its go.sum so nothing has to
# be resolved over a network that is not there.
[ -f go.mod ] || cp /piscine-go-template/go.mod /piscine-go-template/go.sum .

if ! find . -type f -name '*.go' | grep -q .; then
	echo "Missing Go file: ${FILE:-$EXERCISE}"
	exit 13
fi

# ── Run: the student's own code, no gates, no tests ──────────────────────────
if [ "${CODE_EDITOR_RUN_ONLY:-$EXAM_RUN_ONLY}" = true ]; then
	# A function exercise's demo arrives in ./demo, because `package main` cannot
	# share a directory with the `package piscine` file it imports.
	if [ -d ./demo ]; then
		exec go run ./demo "$@"
	fi
	if [ -d "./$EXERCISE" ]; then
		exec go run "./$EXERCISE" "$@"
	fi
	exec go run . "$@"
fi

# ── Gate 0 — compile. Ours, and the one place the sequence departs from upstream.
# `go run ./tests/X_test` exits 1 whether the student failed to compile or the
# assertion failed, and a syntax error would otherwise surface as gofumpt refusing
# to parse. Told plainly, and first, a typo is reported as a typo.
# Two shapes, two invocations, and neither spelling works for both. A program
# exercise needs `-o <dir>/`, because plain `go build ./...` writes each main
# package's binary into the working directory and that name is already taken by the
# package's own directory. A function exercise needs plain `go build`, because
# `-o <dir>/` fails outright with "no main packages to build". `[ -d ./$EXERCISE ]`
# is the same kind test the Run branch above uses.
if [ -d "./$EXERCISE" ]; then
	mkdir -p /tmp/build-check
	out=$(go build -o /tmp/build-check/ ./... 2>&1) || build_failed=1
	rm -rf /tmp/build-check
else
	out=$(go build ./... 2>&1) || build_failed=1
fi
if [ -n "$build_failed" ]; then
	printf '%s\n' "$out"
	exit 12
fi

# ── Gate 1 — formatting ──────────────────────────────────────────────────────
if ! s=$(gofumpt -l -w . 2>&1); then
	printf '%s\n' "$s"
	exit 12
fi
if [ -n "$s" ]; then
	echo 'Your Go files are not correctly formatted :'
	echo
	echo '$ gofumpt -l -w .'
	echo "$s"
	exit 10
fi

# ── Gate 2a — the print/println builtins ─────────────────────────────────────
if find . -type f -name '*.go' -exec grep -qE '\bprint(ln)?\s*\(' {} +; then
	echo "Your Go files cannot use print & println builtins"
	exit 11
fi

# ── Gate 2b — allowed functions. rc runs even with an empty list, to catch
# things like os.Exit(0).
if [ -n "$FILE" ]; then
	# shellcheck disable=SC2086
	if ! rc "$FILE" $ALLOWED_FUNCTIONS; then
		exit 11
	fi
fi

if ! test -e go.mod; then
	echo "Cannot find go.mod file, create your module with:"
	echo "    go mod init piscine"
	exit 13
fi

# ── The test ─────────────────────────────────────────────────────────────────
cd /test-go

if [ "$MEASURE" = 1 ]; then
	# Not exec'd, so the cgroup's high-water mark can be read after the run.
	# cgroup v2 exposes memory.peak; v1 does not, hence the fallback.
	set +e
	go run "./tests/${EXERCISE}_test"
	status=$?
	peak=$(cat /sys/fs/cgroup/memory.peak 2>/dev/null ||
		cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes 2>/dev/null || echo 0)
	echo "[measure] peak-bytes=$peak exit=$status" >&2
	exit $status
fi

exec go run "./tests/${EXERCISE}_test"
