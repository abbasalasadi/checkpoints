#!/usr/bin/env bash
# Runner-image gate for Java (V3 step 7c): builds nothing, runs every exercise
# through the image exactly as JavaBackend does (read-only root, no network,
# tmpfs /tmp, editor files mounted at /jail/student):
#   submit solution must PASS, submit starter must FAIL, run solution must print.
# Prints one line per case and a timing summary.
#   tools/java-image-check.sh [image]
set -uo pipefail
img="${1:-java-checkpoints-runner:dev}"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$root/var/java-image-check"; rm -rf "$work"; mkdir -p "$work"
bad=0; n=0; times=()
run() { # dir className mode(true=run) -> exit code, output in $dir.log
  local dir="$1" cls="$2" only="$3" files
  files="$(cd "$dir" && ls *.java | paste -sd,)"
  docker run --rm --network none --read-only --tmpfs "/tmp:rw,exec,size=256m,mode=1777" \
    --memory 768m --cpus 1 --pids-limit 256 --security-opt no-new-privileges \
    -v "$dir:/jail/student:ro" -e "EXERCISE=$cls" -e "EDITOR_FILES=$files" \
    -e "CODE_EDITOR_RUN_ONLY=$only" "$img" >"$dir.log" 2>&1
}
for ex in "$root"/content/java/exercises/*/; do
  slug="$(basename "$ex")"
  cls="$(sed -n 's/.*"className": "\([^"]*\)".*/\1/p' "$ex/meta.json")"
  for kind in solution starter run; do
    d="$work/$slug-$kind"; mkdir -p "$d"; chmod 755 "$d"
    if [ "$kind" = starter ]; then
      for f in $(sed -n '/"expectedFiles"/,/]/p' "$ex/meta.json" | grep -o '"[A-Za-z]*\.java"' | tr -d '"'); do cp "$ex/$f" "$d/"; done
    else cp "$ex"/solution/*.java "$d/"; fi
    cp "$ex/ExerciseRunner.java" "$d/"; chmod 644 "$d"/*
    t0=$(date +%s%N)
    run "$d" "$cls" "$([ $kind = run ] && echo true || echo false)"; rc=$?
    ms=$(( ($(date +%s%N) - t0) / 1000000 )); n=$((n+1))
    [ "$kind" = solution ] && times+=("$ms")
    case "$kind" in
      solution) ok=$([ $rc -eq 0 ] && echo 1 || echo 0);;
      starter)  ok=$([ $rc -ne 0 ] && echo 1 || echo 0);;
      run)      ok=$([ $rc -eq 0 ] && [ -s "$d.log" ] && echo 1 || echo 0);;
    esac
    if [ "$ok" = 1 ]; then echo "ok   $slug $kind rc=$rc ${ms}ms"; else bad=$((bad+1)); echo "BAD  $slug $kind rc=$rc ${ms}ms"; tail -n 15 "$d.log" | sed 's/^/     /'; fi
  done
done
sorted=$(printf '%s\n' "${times[@]}" | sort -n)
echo "submit(solution) ms: min $(echo "$sorted"|head -1) median $(echo "$sorted"|sed -n "$(( (${#times[@]}+1)/2 ))p") max $(echo "$sorted"|tail -1)"
echo "cases $n, bad $bad"; [ $bad -eq 0 ]
