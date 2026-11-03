#!/usr/bin/env bash
# (LOCAL) Prepare a clean checkout for development.
# Checks prerequisites, creates runtime dirs, seeds .env, installs workspaces.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

print_info "[LOCAL] Checking prerequisites"

require_command node "install Node.js 20 or newer"
require_command npm  "ships with Node.js"

node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
[ "$node_major" -ge 20 ] || die "Node 20+ required, found $(node -v)"
print_info "  node $(node -v), npm $(npm -v)"

# Docker is a hard requirement locally, not only on the VM: the runner IS Docker
# (docs/04-runner.md), so tests exercise real containers. Fail here with a clear
# message rather than surfacing a confusing socket error much later.
require_command docker "the runner is Docker — see docs/04-runner.md"
if ! docker info >/dev/null 2>&1; then
  die "Docker is installed but its daemon is unreachable.
       Start Docker, or add your user to the 'docker' group:
         sudo usermod -aG docker \$USER   # then log out and back in"
fi
print_info "  $(docker --version)"

print_info "[LOCAL] Creating runtime directories under var/"
ensure_runtime_dirs
print_info "  $LOG_DIR"
print_info "  $DB_DIR"

# .env is git-ignored (real values backed up with `make secrets-push`). Seed it
# from the template only when it is missing; never overwrite, never print it.
env_file="$(resolve_env_file)"
if [ ! -f "$env_file" ]; then
  [ -f "$ROOT_DIR/.env.example" ] || die ".env and .env.example are both missing"
  cp "$ROOT_DIR/.env.example" "$env_file"
  chmod 0600 "$env_file"
  print_info "[LOCAL] Created .env from .env.example — fill it in, or run 'make secrets-pull'"
else
  print_info "[LOCAL] .env present"
fi

print_info "[LOCAL] Installing workspace dependencies"
cd "$ROOT_DIR"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

print_info ""
print_info "✅ setup complete — run 'make run' to start, 'make help' for all commands"
