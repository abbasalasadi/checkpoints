.DEFAULT_GOAL := help
.PHONY: help secrets-push secrets-pull

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

secrets-push: ## LOCAL: back up .env and .env.vm to PrivateBox
	@scripts/secrets-backup.sh push

secrets-pull: ## LOCAL: restore .env and .env.vm from PrivateBox (refuses to overwrite)
	@scripts/secrets-backup.sh pull
