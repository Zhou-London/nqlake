# The lakehouse as one command surface. `make up` is the whole service:
# stores, catalog, and init jobs.

.PHONY: up down sql smoke ps logs clean console console-build status load

up:
	docker compose up -d --build

status:
	@python3 scripts/console/nqlake.py --pretty status

# Load a data file into an Iceberg table: make load FILE=x.csv TABLE=ns.name
load:
	@python3 scripts/console/nqlake.py --pretty load --file "$(FILE)" --table "$(TABLE)"

# NQ Lake console (Next.js dev server on http://localhost:3000).
console:
	npm run dev --prefix ui

console-build:
	npm run build --prefix ui && npm run start --prefix ui

down:
	docker compose down

# Interactive DuckDB shell with the catalog already attached as `lake`.
sql:
	docker compose run --rm duckdb

smoke:
	docker compose run --rm smoke-test

ps:
	docker compose ps

logs:
	docker compose logs -f lakekeeper

# Destroys all data: MinIO objects and the catalog database.
clean: down
	rm -rf images/minio/data images/postgres/data images/duckdb/work
