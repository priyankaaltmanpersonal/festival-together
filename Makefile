COMPOSE ?= docker-compose
COMPOSE_FILE ?= infra/docker-compose.yml

.PHONY: help ensure-env build tests up down logs ps restart clean api test-local mobile

help:
	@echo "Festival Together Make targets"
	@echo ""
	@echo "  make ensure-env  Verify required local env files exist"
	@echo "  make build       Build Docker images (api, parser_worker, api_tests)"
	@echo "  make tests       Run API tests in Docker"
	@echo "  make up          Start local Docker stack in background"
	@echo "  make down        Stop and remove local Docker stack"
	@echo "  make logs        Tail API and parser worker logs"
	@echo "  make ps          Show Docker compose service status"
	@echo "  make restart     Restart stack (down + up)"
	@echo "  make clean       Stop stack and remove volumes"
	@echo "  make api         Run API locally (no Docker)"
	@echo "  make test-local  Run API tests from project venv"
	@echo "  make mobile      Start Expo app"

build:
	$(MAKE) ensure-env
	$(COMPOSE) -f $(COMPOSE_FILE) build api parser_worker api_tests

tests:
	$(MAKE) ensure-env
	$(COMPOSE) -f $(COMPOSE_FILE) run --rm api_tests

up:
	$(MAKE) ensure-env
	$(COMPOSE) -f $(COMPOSE_FILE) up --build -d postgres redis minio api parser_worker

down:
	$(COMPOSE) -f $(COMPOSE_FILE) down

logs:
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f api parser_worker

ps:
	$(COMPOSE) -f $(COMPOSE_FILE) ps

restart: down up

clean:
	$(COMPOSE) -f $(COMPOSE_FILE) down -v

api:
	cd services/api && uv run uvicorn app.main:app --reload --port 8000

test-local:
	cd services/api && ../../.venv/bin/pytest -q

mobile:
	cd apps/mobile && npm run start

ensure-env:
	@test -f infra/.env || (echo "Missing infra/.env. Run: cp infra/.env.example infra/.env" && exit 1)
