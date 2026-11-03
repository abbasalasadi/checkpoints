# Checkpoints — Status

As of: 2026-11-03 night · Version: V1 (scoping) · Run mode: economy · Forecast completion: <date> (<change since last>)

## Claims
| Step | Agent / role | Since | Branch / worktree |
|---|---|---|---|
| Steps 2-9 (parallel agents: content, server, runners, web, migration+deploy) | checkpoint_main | 2026-11-03 | laptop |

## Done
- <item> — Result check: <artifact> — <value> (<bound or reference>) — correct

## Running
- <item> — run <id> on <host> — <how to check>
- VM: lan_vm1 assigned (checkpoints-1, shared, 4 threads / 6 GB / 15 GB disk, ~2 days from 2026-11-03). Start runs only when `make health HOST=lan_vm1` shows 1-min load < 4 and > 8 GB free. On finish: clean task folders and Docker images, send [RELEASE].

## Blocked
- <item> — <cause> — <what unblocks it; sweep state if a result was wrong>

## Needed from the owner
1. **Leaked secrets in the reference repos:** `/home/abbas/Documents/js-checkpoints`, `/home/abbas/Documents/go-checkpoints` and `/home/abbas/Documents/rust` have `.env` and `.env.vm` tracked in git (Go's STATUS.md says the only secret there is `SESSION_SIGNING_KEY`, which the new app does not use). Rotate every key in them, then remove them from git and its history (about 20 minutes). Not touched by this project.

## Effort and cost
- <agent class> at <effort> (<reason if above medium>) — wall time, cost, outcome
- Budget (paid resources only): spent <x> of <limit>
