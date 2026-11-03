# Checkpoints — Status

As of: 2026-11-03 night · Version: V1 (scoping) · Run mode: economy · Forecast completion: <date> (<change since last>)

## Claims
| Step | Agent / role | Since | Branch / worktree |
|---|---|---|---|
| — | — | — | — |

## Done
- <item> — Result check: <artifact> — <value> (<bound or reference>) — correct

## Running
- <item> — run <id> on <host> — <how to check>

## Blocked
- <item> — <cause> — <what unblocks it; sweep state if a result was wrong>

## Needed from the owner
1. **Leaked secrets in the reference repos:** `/home/abbas/Documents/js-checkpoints` and `/home/abbas/Documents/go-checkpoints` have `.env` and `.env.vm` tracked in git (Go's STATUS.md says the only secret there is `SESSION_SIGNING_KEY`, which the new app does not use). Rotate every key in them, then remove them from git and its history (about 20 minutes). Not touched by this project.

## Effort and cost
- <agent class> at <effort> (<reason if above medium>) — wall time, cost, outcome
- Budget (paid resources only): spent <x> of <limit>
