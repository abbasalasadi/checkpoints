#!/bin/sh
# Container entry (V3 step 7c). The runner mounts the student's editor files
# read-only at /jail/student and the root filesystem is read-only, so they are
# copied into the tmpfs first; then the official entrypoint runs unchanged from
# there (it works relative to its cwd: ./student in, ./project out).
set -e
mkdir -p /tmp/work/student
cp /jail/student/*.java /tmp/work/student/ 2>/dev/null || true
cd /tmp/work
exec /app/entrypoint.sh
