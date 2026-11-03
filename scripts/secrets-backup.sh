#!/usr/bin/env bash
# Back up / restore this project's git-ignored secrets files to PrivateBox as one archive.
# Copy to the project's scripts/ and change only the three settings below.
#
#   scripts/secrets-backup.sh push                  upload, replacing the previous backup safely
#   scripts/secrets-backup.sh pull [DEST] [--force] restore into DEST (default: repo root);
#                                                   refuses to overwrite unless --force
#
# The token is entered by the owner in .env, never printed or committed. It reaches
# curl through a config on a file descriptor, not argv.
set -euo pipefail

FILES=(.env .env.vm)                         # files and folders to pack, relative to the repo root
FOLDERS=(secrets-backup checkpoints)         # target folder path on PrivateBox
TOKEN_VAR=CHECKPOINTS_PRIVATEBOX_TOKEN       # token variable name in .env

die() { echo "secrets-backup: $*" >&2; exit 1; }
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT"
command -v jq >/dev/null || die "jq is required"
ARCHIVE="${FOLDERS[-1]}-secrets.tar.gz"
base="https://privatebox.appsyss.com"
env_get() { [[ -f .env ]] && sed -n "s/^$1=//p" .env | tail -1 | sed 's/^["'\'']//; s/["'\'']$//' || true; }
token="${!TOKEN_VAR:-$(env_get "$TOKEN_VAR")}"  # environment first, so pull works on an empty machine
[[ -n "$token" ]] || die "$TOKEN_VAR is empty in .env — the owner creates one in PrivateBox (Access tokens tab) and pastes it there."

api() {
  local method="$1" path="$2"; shift 2
  curl -sS --fail-with-body -X "$method" -K <(printf 'header = "Authorization: Bearer %s"\n' "$token") "$@" "$base$path"
}
child_id() {
  api GET "/api/items?limit=1000${1:+&parentId=$1}" | jq -r --arg n "$2" '.data.items[] | select(.name==$n) | .id' | head -1
}
ensure_folder() {
  local parent="" id name
  for name in "${FOLDERS[@]}"; do
    id="$(child_id "$parent" "$name")"
    if [[ -z "$id" ]]; then
      id="$(api POST /api/folders -H 'Content-Type: application/json' \
        -d "$(jq -nc --arg n "$name" --arg p "$parent" '{name:$n, parentId:(if $p=="" then null else $p end)}')" | jq -r .data.id)"
    fi
    parent="$id"
  done
  printf '%s' "$parent"
}
find_folder() {
  local parent="" name
  for name in "${FOLDERS[@]}"; do
    parent="$(child_id "$parent" "$name")"; [[ -n "$parent" ]] || return 0
  done
  printf '%s' "$parent"
}

case "${1:-}" in
  push)
    for f in "${FILES[@]}"; do [[ -e "$f" ]] || die "$f not found"; done
    work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
    tar -czf "$work/$ARCHIVE" "${FILES[@]}"
    f="$work/$ARCHIVE" tmp="$ARCHIVE.uploading"
    size="$(stat -c%s "$f")"; sum="$(sha256sum "$f" | cut -d' ' -f1)"
    folder="$(ensure_folder)"
    # Upload under a temporary name, then swap, so a failed upload never destroys the last backup.
    old="$(child_id "$folder" "$tmp")"; [[ -z "$old" ]] || api DELETE "/api/items/$old" >/dev/null
    up="$(api POST /api/uploads -H 'Content-Type: application/json' -d "$(jq -nc \
      --arg p "$folder" --arg n "$tmp" --argjson s "$size" --arg c "$sum" \
      '{parentId:$p, name:$n, size:$s, contentType:"application/gzip", checksumSha256:$c}')" | jq -r .data.id)"
    api PATCH "/api/uploads/$up" -H "Upload-Offset: 0" --data-binary "@$f" >/dev/null
    api POST "/api/uploads/$up/finish" >/dev/null
    old="$(child_id "$folder" "$ARCHIVE")"; [[ -z "$old" ]] || api DELETE "/api/items/$old" >/dev/null
    api POST "/api/items/$(child_id "$folder" "$tmp")/rename" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg n "$ARCHIVE" '{name:$n}')" >/dev/null
    echo "pushed $ARCHIVE ($size bytes)"
    ;;
  pull)
    dest="${2:-$ROOT}"; force="${3:-}"; [[ "$dest" == "--force" ]] && { dest="$ROOT"; force=--force; }
    mkdir -p "$dest"
    if [[ "$force" != "--force" ]]; then
      for f in "${FILES[@]}"; do [[ ! -e "$dest/$f" ]] || die "$dest/$f exists — use --force to overwrite"; done
    fi
    folder="$(find_folder)"; [[ -n "$folder" ]] || die "no backup folder on PrivateBox"
    id="$(child_id "$folder" "$ARCHIVE")"; [[ -n "$id" ]] || die "no $ARCHIVE in the backup folder"
    work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
    api GET "/api/items/$id/content" -o "$work/$ARCHIVE"
    tar -xzf "$work/$ARCHIVE" -C "$dest"
    for f in "${FILES[@]}"; do [[ -f "$dest/$f" ]] && chmod 600 "$dest/$f"; done
    echo "pulled into $dest"
    ;;
  *) echo "usage: $0 push | pull [DEST] [--force]" >&2; exit 2 ;;
esac
