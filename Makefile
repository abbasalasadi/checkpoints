.DEFAULT_GOAL := help
.PHONY: help parity secrets-push secrets-pull setup run kill dev test build migrate-merge backup deploy-check deploy deploy-light nginx-setup runner-images images maintenance-on maintenance-off legacy-maintenance-on legacy-redirect

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

secrets-push: ## LOCAL: back up .env and .env.vm to PrivateBox
	@scripts/secrets-backup.sh push

secrets-pull: ## LOCAL: restore .env and .env.vm from PrivateBox (refuses to overwrite)
	@scripts/secrets-backup.sh pull

# ─── Local development (API 8157, Vite 5203 — docs/v1-contracts.md) ──────────

API_PORT ?= 8157
WEB_PORT ?= 5203

setup: ## LOCAL: check prerequisites, create var/, install workspaces
	@bash scripts/setup.sh

run: ## LOCAL: start API (8157) and Vite (5203) detached; logs in var/logs, stop with make kill
	@mkdir -p var/logs var/db
	@API_PORT=$(API_PORT) nohup npm run serve --workspace server > var/logs/backend.out 2>&1 & echo $$! > var/backend.pid
	@API_PORT=$(API_PORT) WEB_PORT=$(WEB_PORT) nohup npm run dev --workspace web > var/logs/frontend.log 2>&1 & echo $$! > var/frontend.pid
	@sleep 3
	@echo "API  http://127.0.0.1:$(API_PORT)   (var/logs/backend.log; console in backend.out)"
	@echo "Web  http://127.0.0.1:$(WEB_PORT)   (var/logs/frontend.log)"

kill: ## LOCAL: stop whatever holds the API and Vite ports
	@bash -c 'source scripts/lib/common.sh; kill_by_port $(API_PORT); kill_by_port $(WEB_PORT)'
	@rm -f var/backend.pid var/frontend.pid

dev: ## LOCAL: API and Vite in the foreground with reload
	@API_PORT=$(API_PORT) npm run dev --workspace server & API_PORT=$(API_PORT) WEB_PORT=$(WEB_PORT) npm run dev --workspace web; wait

test: ## VM (via project_manager make send/run): server and web test suites
	@npm test

parity: ## VM (via project_manager make send/run): runner parity, solution passes / starter fails (LANG=go|js|rust ONLY=a,b)
	@npx tsx tools/parity.ts $(if $(LANG),--lang $(LANG)) $(if $(ONLY),--only $(ONLY)) $(if $(CONCURRENCY),--concurrency $(CONCURRENCY))

build: ## VM (via project_manager make send/run): build server (dist + migrations) and web (dist)
	@npm run build

# ─── Data ────────────────────────────────────────────────────────────────────

migrate-merge: ## Merge reference DBs: make migrate-merge GO=.. JS=.. RUST=.. OUT=.. [DRY=1]
	@test -n "$(OUT)" || { echo "OUT=<new db> is required"; exit 1; }
	@node scripts/migrate/merge-dbs.mjs $(if $(GO),--go $(GO)) $(if $(JS),--js $(JS)) $(if $(RUST),--rust $(RUST)) --out $(OUT) $(if $(DRY),--dry-run)

backup: ## VM or LOCAL: online, integrity-checked SQLite backup into var/backups
	@bash scripts/backup.sh

# ─── Deploy (prepared; run only on the owner's go) ───────────────────────────

deploy-check: ## DEPLOY: preflight the VM from .env.vm
	@bash scripts/deploy/check.sh

deploy: ## DEPLOY: full deploy (nginx, certs, npm ci, runner images, unit)
	@bash scripts/deploy/deploy.sh

deploy-light: ## DEPLOY: code-only redeploy, refuses when unsafe
	@bash scripts/deploy/deploy-light.sh

nginx-setup: ## DEPLOY: nginx site + 301s from the old hosts (LEGACY_DISABLE=1 to unlink old vhosts)
	@bash scripts/deploy/nginx-setup.sh

runner-images: ## DEPLOY: build go/js/rust runner images on the VM
	@bash scripts/deploy/runner-image.sh

images: runner-images ## DEPLOY: alias of runner-images (contexts from content/<lang>)

maintenance-on: ## DEPLOY: show the maintenance page
	@bash scripts/deploy/maintenance-on.sh

maintenance-off: ## DEPLOY: hide the maintenance page
	@bash scripts/deploy/maintenance-off.sh

legacy-maintenance-on: ## DEPLOY: old go-/js-/rust- sites to maintenance (no off)
	@bash scripts/deploy/legacy-maintenance-on.sh

legacy-redirect: ## DEPLOY: old sites show a "moved" page linking to the dashboard
	@bash scripts/deploy/legacy-redirect.sh
