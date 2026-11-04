#!/usr/bin/env bash
# Authoring check for one Java exercise (V3 step 7b): compiles the solution or
# the starter with the official harness and test, runs the test the way the
# official entrypoint does (random exit code), and prints PASS / FAIL / NOCOMPILE.
# Plain javac + the same jars as the image's offline Maven repo; the real
# verdicts come from the runner image (step 7c), this is only a quick loop.
#
#   tools/java-check.sh <slug> [solution|starter]
#   JAVA_REPO=<path to the image's app/tests_utility> (defaults to the backup export)
set -euo pipefail
slug="$1"; which="${2:-solution}"
root="$(cd "$(dirname "$0")/.." && pwd)"
ex="$root/content/java/exercises/$slug"
repo="${JAVA_REPO:-/media/abbas/Data D/00. Backup/Reboot/Master-Repos/Checkpoints/module-java-docker/app/tests_utility}"
cls="$(sed -n 's/.*"className": "\([^"]*\)".*/\1/p' "$ex/meta.json")"

cp=""
for j in org/apiguardian/apiguardian-api/1.1.2/apiguardian-api-1.1.2.jar \
         org/opentest4j/opentest4j/1.3.0/opentest4j-1.3.0.jar \
         org/assertj/assertj-core/3.22.0/assertj-core-3.22.0.jar \
         org/junit/jupiter/junit-jupiter-api/5.10.2/junit-jupiter-api-5.10.2.jar \
         org/junit/jupiter/junit-jupiter-engine/5.10.2/junit-jupiter-engine-5.10.2.jar \
         org/junit/platform/junit-platform-commons/1.10.2/junit-platform-commons-1.10.2.jar \
         org/junit/platform/junit-platform-engine/1.10.2/junit-platform-engine-1.10.2.jar \
         org/junit/platform/junit-platform-launcher/1.10.2/junit-platform-launcher-1.10.2.jar; do
  cp="$cp:$repo/$j"
done

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/src"
if [ "$which" = solution ]; then cp "$ex"/solution/*.java "$work/src/"; else
  for f in $(sed -n '/"expectedFiles"/,/]/p' "$ex/meta.json" | grep -o '"[A-Za-z]*\.java"' | tr -d '"'); do cp "$ex/$f" "$work/src/"; done
fi
cp "$root/content/java/sources/harness/"*.java "$ex"/test/*.java "$work/src/"
cd "$work"
if ! javac -nowarn -cp "${cp#:}" -d build src/*.java >compile.log 2>&1; then
  echo "NOCOMPILE $slug ($which)"; sed -n 1,15p compile.log; exit 2
fi
code=$((RANDOM % 100 + 100)); printf '%s' "$code" > .exit
set +e
timeout 60 java -cp "build$cp" TestRunnerMain --select-class "${cls}Test" >run.log 2>&1
rc=$?
set -e
if [ "$rc" -eq "$code" ]; then echo "PASS $slug ($which)"; else echo "FAIL $slug ($which)"; sed -n 1,25p run.log; fi
