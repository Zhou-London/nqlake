# The lakehouse as one command surface. `make up` is the whole service:
# stores, catalog, and init jobs, plus the Python environment the CLI and
# the console backend run in.

.PHONY: up down smoke ps logs clean console console-build status load ports

CONSOLE_PORT = $(or $(shell sed -n 's/^CONSOLE_PORT=//p' .env),\
               $(error CONSOLE_PORT is not set in .env))

# nqlake.py runs under the uv-managed interpreter pinned by .python-version
# and uv.lock; --frozen means the lock is the truth, never silently updated.
NQLAKE = uv run --frozen python backend/nqlake.py

up:
	uv sync --frozen
	docker compose up -d --build --remove-orphans

status:
	@$(NQLAKE) --pretty status

ports:
	@$(NQLAKE) --pretty ports

# Load a data file into an Iceberg table: make load FILE=x.csv TABLE=ns.name
load:
	@$(NQLAKE) --pretty load --file "$(FILE)" --table "$(TABLE)"

# NQ Lake console
console:
	npm run dev --prefix ui -- --port $(CONSOLE_PORT)

console-build:
	npm run build --prefix ui && npm run start --prefix ui -- --port $(CONSOLE_PORT)

down:
	docker compose down

# End-to-end check: write and read an Iceberg table through the catalog.
smoke:
	@$(NQLAKE) --pretty ops --action smoke

ps:
	docker compose ps

logs:
	docker compose logs -f lakekeeper

# Destroys all data: MinIO objects and the catalog database.
clean: down
	rm -rf images/minio/data images/postgres/data images/duckdb/work
