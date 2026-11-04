# Handoff — 2026-11-04

V2 is built (steps 1-8 done, step 9 audit pass). Next action: **the owner tests V2 locally** at http://localhost:5203 (`make run`; real Reboot01 sign-in). Fix what they report, then, only with their approval (D20): re-merge is NOT needed for V2 (old sites untouched, D21), deploy with `LEGACY_REDIRECT=0 make deploy` (Node 22 PATH) — the deploy must also rebuild the Go runner image (new entrypoint) or Go Cloud Run image as applicable, and run migrations 004/005. Then tag v2.0 and finalise docs/releases/v2.0.md.

Notes: local DB holds only the owner's own logins (fake users removed). The laptop Go image was rebuilt with the read-only entrypoint. lan_vm1 task folders cleaned.
