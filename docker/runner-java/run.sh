#!/bin/sh
# Container entry (V3 step 7c). The runner mounts the student's editor files
# read-only at /jail/student and the root filesystem is read-only, so they are
# copied into the tmpfs first; then the official entrypoint runs unchanged from
# there (it works relative to its cwd: ./student in, ./project out).
# The Cloud Run wrapper (cloudrun/) sets STUDENT_DIR and WORK_DIR per request.
set -e
work="${WORK_DIR:-/tmp/work}"
mkdir -p "$work/student"
cp "${STUDENT_DIR:-/jail/student}"/*.java "$work/student/" 2>/dev/null || true
cd "$work"
exec /app/entrypoint.sh
