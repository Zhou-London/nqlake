# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NQ Lake, a self-contained Iceberg lakehouse: MinIO holds the Parquet files,
Lakekeeper on Postgres is the REST catalog, a FastAPI backend (`nqlake`)
manages tables with PyIceberg and answers SQL with DuckDB, and a Next.js
console sits on top. [README.md](README.md) documents the API routes and the
Parquet type repairs; `docs/release-notes/<version>.md` records each release.

The `lakehouse-*` image definitions live in the parent repository under
`Dockerfiles/`. `compose.yaml` builds them from `DOCKERFILES_DIR`, an absolute
path in `.env`. A change to what a service installs belongs there, not here.

## Commands

Everything goes through the Makefile at the root. `.env` (copied from
`.env.example`, gitignored) supplies every port and credential.

```bash
make up            # uv sync, compose up --build, then the API and the console on the host
make down          # stops the console, the API, and the compose stack
make api           # runs the API in the foreground; stop the background one first (make api-stop)
make api-logs      # tails images/api/state/api.log
make console       # next dev on CONSOLE_PORT; collides with the `next start` that make up left running
make logs          # follows lakekeeper
make clean         # DESTROYS all data: MinIO objects, the catalog database, the API state
```

`make up` is the only verification of a compose, script, or backend change.
After it, exercise the change through `/docs` on `API_PORT` (default 40004)
or the console on `CONSOLE_PORT` (default 40001). There is no backend test
suite.

Console, from `console/`:

```bash
npm run typecheck
npm test                              # node --test lib/*.test.mjs
node --test --test-name-pattern="CSV" lib/data.test.mjs   # one test
npm run build                         # add -- --webpack when Turbopack's worker ports are blocked
npm run format
```

Python runs only through `uv run --frozen` under the interpreter in
`.python-version` (3.14) and `uv.lock`; never a bare `python3`. `backend/` is
put on `PYTHONPATH` by the Makefile, nothing is installed
(`tool.uv.package = false`).

`.claude/launch.json` defines `nqlake-api` and `nqlake-console` for the
browser preview.

## Architecture

### Two runtimes

`compose.yaml` runs the stores and the one-shot init jobs: `minio`,
`postgres`, `lakekeeper`, and the jobs `minio-init`, `lakekeeper-migrate`,
`lakekeeper-init`. The API and the console run on the host as background
processes with pid and log files under `images/<service>/state/`. The API
lives on the host because DuckDB and its Iceberg extension are built for the
host; the extensions install into `images/duckdb/extensions/` on first use.

- **Init jobs are idempotent.** `make up` re-runs them against a live stack.
  `lakekeeper-init` treats a second bootstrap as success, creates the
  warehouse only when absent, and rewrites the warehouse's storage profile
  when `MINIO_API_PORT` changed. `minio-init` re-applies the bucket, the user,
  and the policy. Anything added to either script follows the same rule.
- **`depends_on` carries the ordering.** Stores gate on `service_healthy`,
  jobs on `service_completed_successfully`. Fix a race by adding the missing
  condition, never a sleep.
- **Every compose variable is `${VAR:?}`**, so a missing key in `.env` fails
  the run at once. A new variable goes into `.env.example` too.
- **Ports live only in `.env`.** One number is both what a service listens on
  and what it publishes. `compose.yaml`, the init scripts, `nqlake/config.py`,
  `run.mjs`, `manage.mjs`, and the Makefile all read it from there. A port
  literal in code is a bug.

### Credentials

Clients hold no S3 secret for table access. Lakekeeper vends short-lived
MinIO STS credentials per table, which is why `minio-init` creates a non-root
user: MinIO refuses `AssumeRole` for root. Lakekeeper runs without
authentication, and the console runs arbitrary SQL and admin operations, so
everything binds `127.0.0.1` and stays a localhost tool.

### Backend: `backend/nqlake`

Two layers, and the split is the rule for every change:

- `nqlake.lake` talks to the systems. **PyIceberg manages**: namespaces,
  table creation, schema and property changes, appends, deletes, scans, all
  through the REST catalog (`lake/catalog.py`, `lake/tables.py`). **DuckDB
  computes**: read-only SQL over the same catalog (`lake/query.py`). Do not
  create or write a table with SQL, and do not remove `READ_ONLY` from the
  `ATTACH`.
- `nqlake.api` is the HTTP surface only: routers under `api/routes/`, Pydantic
  models in `api/schemas.py`, and `api/errors.py`, which maps the
  `nqlake.errors` hierarchy to status codes and one JSON shape
  `{"error", "problems"}`. A new failure mode is a `LakeError` subclass raised
  in `lake`, plus a `_STATUS` entry when it needs a new code.

Other facts that shape backend work:

- `FORMAT_VERSION = 2` in `lake/__init__.py`. PyIceberg 0.12 writes v1 and
  v2 manifests only; a v3 table could be created but never filled.
- `pyproject.toml` pins `duckdb` and `pyiceberg` exactly. The Iceberg
  extension is built per DuckDB release and PyIceberg's write path moves
  between releases. Upgrading is: edit the pin, `uv lock`, `make up`, then
  try a Parquet upload and a query.
- `api/deps.py` opens the catalog client and the DuckDB `Engine` lazily and
  once per process, so the API starts before Lakekeeper answers. `Engine`
  holds one DuckDB database and gives each request a cursor; a transport
  failure closes the database so the next request reopens it.
- DuckDB sets `http_proxy = ''` and attaches with vended credentials; a
  static S3 secret is created only for the metadata reads DuckDB makes
  outside vending. Do not hand DuckDB a static key to work around an STS
  problem, and do not point the storage profile at `localhost` (Lakekeeper
  itself would lose MinIO).
- A schema-only commit (an added column) reaches `/query` about one second
  late; row commits are visible at once.
- `config.py` reads `.env` with process environment variables winning. Every
  connection reads the warehouse name and ports from `Settings` at open time.
- `lake/parquet.py` decides, per column, between a reported repair and a
  rejection that names the fix. Keep the lossless/lossy split in the README's
  table in step with the code.

### Console: `console/`

Next.js 16 App Router, React 19, TypeScript. The UI is `@nowquant/nqui` and
nothing else: no custom CSS beyond the two lines in `globals.css`, no `cn`,
no wrapper components. Pages compose NQUI directly. Read
`console/node_modules/next/dist/docs/` before writing Next code; the
`AGENTS.md` there is regenerated by `next dev` and is not hand-edited.

- **The browser never talks to the backend.** `app/api/lake/[...path]/route.ts`
  proxies `/api/lake/*` to `127.0.0.1:API_PORT`. It allowlists the first path
  segment (`status`, `namespaces`, `query`, `parquet`) and rejects
  cross-origin writes. A new top-level backend route must be added to that
  allowlist.
- **Use `api()` from `lib/api.ts`**, never raw `fetch` + `JSON.parse`. It
  parses through `parseLakeJson`, which keeps 64-bit values such as snapshot
  ids as decimal strings. `lib/data.mjs` is plain JavaScript so `node --test`
  runs its tests without a build; put testable pure helpers there.
- `components/lake-provider.tsx` holds the status, namespaces, and table list
  for every page and exposes `refresh()`.
- `run.mjs` (dev, start) and `manage.mjs` (background start/stop for
  `make up`) read `CONSOLE_PORT` from the root `.env`; `next.config.mjs`
  loads the same file so `API_PORT` reaches the proxy.

## Commits

One change per commit, imperative subject, body explaining why. Never commit
`.env`, `images/*/data`, `images/*/state`, `.venv/`, or `console/node_modules`.
`uv.lock` and `console/package-lock.json` are committed. A release adds
`docs/release-notes/<version>.md` and a link in the README.
