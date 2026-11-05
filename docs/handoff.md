# Handoff — 2026-11-05

**State:** V4 with the owner-test fixes is deployed to production (see `docs/release.md`, "Owner-test fixes"). The owner is testing the live site.

**Next action:**
1. When the owner confirms production: `git tag v4.0 && git push --tags`; mark the last box in `docs/release.md`.
2. Merge of the three old sites' databases — planned only (docs/versions.md). Wait for the owner's go. Open question to the owner: erase A) all new-site data, B) only test data, C) only local data.
   Old sites end on a redirect page to the new app, never maintenance-off.

**Notes:**
- `make send` ships the last commit: commit before any VM test.
- Content is loaded at server start: restart the local server (`make kill && make run`) after content edits.
