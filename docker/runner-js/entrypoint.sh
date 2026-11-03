#!/bin/sh
# Same contract as the upstream module-js entrypoint, so the official image stays a drop-in
# fidelity check:
#
#   EXERCISE              slug the harness looks up as tests/<EXERCISE>_test.js
#   FILE                  comma-separated expected files (meta.expectedFiles)
#   EDITOR_FILES          files to concatenate in run-only mode
#   CODE_EDITOR_RUN_ONLY  "true" runs the student's code without testing it
#   /jail/student         read-only mount holding the student's files
#
# Additions of ours: STUDENT_DIR (default /jail/student) and MEASURE=1, which appends the
# cgroup peak-memory reading so tools/measure.mjs can size the concurrency cap.

set -u

STUDENT_DIR="${STUDENT_DIR:-/jail/student}"
: "${EXERCISE:=}"
: "${FILE:=}"
: "${EDITOR_FILES:=}"
: "${CODE_EDITOR_RUN_ONLY:=false}"
: "${MEASURE:=0}"

# The harness writes its combined module to $TMPDIR/<exercise>.mjs. Keep every run on its own
# tmpfs so two runs of one exercise can never import each other's code.
TMPDIR="${TMPDIR:-/tmp}"
export TMPDIR

report_peak() {
  [ "$MEASURE" = "1" ] || return 0
  for f in /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory/memory.max_usage_in_bytes; do
    if [ -r "$f" ]; then
      echo "::PEAK::$(cat "$f")"
      return 0
    fi
  done
  echo "::PEAK::unavailable"
}

if [ "$CODE_EDITOR_RUN_ONLY" = "true" ]; then
  # Run the student's code, no test. Rootfs is read-only, so assemble in TMPDIR.
  run_file="$TMPDIR/run.js"
  : >"$run_file"
  echo "$EDITOR_FILES" | tr ',' '\n' | while IFS= read -r name; do
    [ -n "$name" ] || continue
    cat "$STUDENT_DIR/$name" >>"$run_file"
    echo >>"$run_file"
  done
  node "$run_file" "$@"
  status=$?
  report_peak
  exit $status
fi

if [ -z "$EXERCISE" ]; then
  echo "EXERCISE is required" >&2
  exit 2
fi

node /app/test.mjs "$STUDENT_DIR" "$EXERCISE" "$FILE" "$EDITOR_FILES"
status=$?
report_peak
exit $status
