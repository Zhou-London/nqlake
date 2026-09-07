# Every command of the lakehouse. `make up` starts the whole service: the
# stores, the catalog, and the init jobs in compose, plus the backend API as a
# background process on the host and the Next.js console. `make down` stops all services.

.PHONY: up down api api-start api-stop api-logs console console-build console-start console-stop console-logs ps logs clean

API_PORT = $(or $(shell sed -n 's/^API_PORT=//p' .env),40004)

# The API runs on the host, not in compose, because DuckDB and its extensions
# are built for the host (see pyproject.toml). The pid and log files live here.
API_STATE = images/api/state
API_PID = $(API_STATE)/api.pid
API_LOG = $(API_STATE)/api.log

# uv runs the API under the interpreter pinned by .python-version and
# uv.lock. --frozen makes uv use the lock file as it is and never update it.
API_RUN = PYTHONPATH=backend uv run --frozen python -m nqlake

up:
	uv sync --frozen
	docker compose up -d --build --remove-orphans
	@$(MAKE) --no-print-directory api-start
	@$(MAKE) --no-print-directory console-start

down: console-stop api-stop
	docker compose down

# Starts the API in the background. An API that is already running is left alone.
api-start:
	@mkdir -p $(API_STATE)
	@if [ -f $(API_PID) ] && kill -0 $$(cat $(API_PID)) 2>/dev/null; then \
	    echo "api: already running (pid $$(cat $(API_PID))) on http://localhost:$(API_PORT)"; \
	else \
	    $(API_RUN) >$(API_LOG) 2>&1 & echo $$! >$(API_PID); \
	    for i in $$(seq 1 50); do \
	        curl -sf --noproxy '*' -o /dev/null http://localhost:$(API_PORT)/openapi.json && break; \
	        sleep 0.2; \
	    done; \
	    if curl -sf --noproxy '*' -o /dev/null http://localhost:$(API_PORT)/openapi.json; then \
	        echo "api: started (pid $$(cat $(API_PID))) on http://localhost:$(API_PORT), log in $(API_LOG)"; \
	    else \
	        echo "api: failed to start; see $(API_LOG)" >&2; exit 1; \
	    fi; \
	fi

# Stops the API and waits for the process to exit, so a following api-start
# finds the port free and an empty log.
api-stop:
	@if [ -f $(API_PID) ] && kill $$(cat $(API_PID)) 2>/dev/null; then \
	    for i in $$(seq 1 100); do kill -0 $$(cat $(API_PID)) 2>/dev/null || break; sleep 0.1; done; \
	    echo "api: stopped (pid $$(cat $(API_PID)))"; \
	else \
	    echo "api: not running"; \
	fi; \
	rm -f $(API_PID)

# Runs the API in the foreground, for development. Stop the background one first.
api:
	$(API_RUN)

api-logs:
	tail -f $(API_LOG)

ps:
	docker compose ps

logs:
	docker compose logs -f lakekeeper

# Destroys all data: MinIO objects, the catalog database, and the API's state.
clean: down
	rm -rf images/minio/data images/postgres/data images/duckdb/work $(API_STATE)

# The console reads CONSOLE_PORT and API_PORT from the root .env.
console:
	cd console && npm run dev

console-build:
	cd console && npm ci && npm run build

console-start:
	node console/manage.mjs start

console-stop:
	node console/manage.mjs stop

console-logs:
	tail -f images/console/state/console.log
