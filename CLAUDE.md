# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`nqlake` — a self-contained Iceberg lakehouse: MinIO for objects, Lakekeeper on
Postgres as the REST catalog, DuckDB as the query engine, PyIceberg as the
table manager, plus a CLI and a Next.js console over the top. The stores and
the catalog are one compose project; the two engines run in-process in
`backend/data.py` under a uv-pinned Python. See [README.md](README.md).

## Layout

```
compose.yaml        the stores, the catalog, and their one-shot init jobs
.env.example        credential/name template; copy to .env (gitignored)
pyproject.toml      the Python side; with .python-version and uv.lock it pins
                    the interpreter and DuckDB
Makefile            the command surface (up/down/smoke/status/load/ports/console)
backend/            nqlake.py (CLI + console backend), stack.py,
                    data.py (PyIceberg: catalog/load/drop/smoke; DuckDB:
                    rows/query), ports.py (the .env port registry); and the
                    scripts the init containers run: minio-init.sh,
                    lakekeeper-init.sh
ui/                 the console (Next.js); its API routes shell out to nqlake.py
                    (ui/README.md documents its shape)
images/             bind-mounted service data, gitignored
```

Image definitions are **not** here — they live in the parent repository under
`Dockerfiles/lakehouse-*`, and `compose.yaml` builds them from
`DOCKERFILES_DIR`, an absolute path set in `.env`. A change to what is
installed in a service belongs there, not in this repo.

## Working on the stack

`make up` is the verification. It syncs the Python environment, builds,
starts the stores, and re-runs both init jobs; `make smoke` then writes and
reads an Iceberg table end to end from the host. A compose change nobody
brought up is unverified.

```bash
make up && make smoke
```

- **Init jobs must stay idempotent.** `make up` re-runs them on every
  invocation against a live stack, so they converge rather than fail:
  `lakekeeper-init` treats a second bootstrap as success and creates the
  warehouse only when absent, `minio-init` re-applies bucket and user state.
  Anything added there follows the same rule.
- **`depends_on` carries the ordering.** The stack is a dependency graph, not a
  sequence of sleeps: stores gate on `service_healthy`, one-shot jobs on
  `service_completed_successfully`. Fix a race by adding the missing condition,
  never by adding a delay.
- Every variable in `compose.yaml` uses `${VAR:?}`, so a missing key in `.env`
  fails the run immediately instead of starting a half-configured service.
  Adding a variable means adding it to `.env.example` too.

## Ports

Every port the stack binds is a variable in `.env`, and one number serves
both sides: what a service listens on and what it publishes. `compose.yaml`,
the init scripts, `nqlake.py`, and the Makefile all read it from there, so a
port literal anywhere in them is a bug, not a shortcut.

`backend/ports.py` owns that file — the registry of variables, the
checks a value has to pass, and the write. A new component's port is an entry
there, a line in `.env.example`, and `${VAR:?}` wherever compose needs it;
the CLI and the console pick it up with no further work.

Applying a change is `make up`, which recreates the services whose mapping
moved. MinIO is the one with state behind it: its address is stored in the
warehouse's storage profile, so `lakekeeper-init` compares the two and writes
the new endpoint back rather than leaving the catalog vending credentials for
an address nothing listens on.

## Credentials

`.env` is gitignored and never committed; `.env.example` carries the keys with
placeholder values. Do not put a real secret in the example, in `compose.yaml`,
or in a script.

Clients hold no S3 secret. Lakekeeper vends short-lived MinIO STS credentials
per table access, which is why `minio-init` creates a dedicated `lakekeeper`
user — MinIO refuses `AssumeRole` for root credentials. Keep it that way; do
not hand a query engine a static key to work around an STS problem.

## Two engines: DuckDB computes, PyIceberg manages

This is the rule every data-plane change follows.

- **DuckDB** runs queries, pages rows, and parses files. `data.connect()`
  opens an in-memory database, loads the extensions from
  `images/duckdb/extensions` (installed there on first use), and attaches the
  catalog **read-only** (`READ_ONLY` in `data.attach_sql()`). Do not
  remove that flag, and do not add a call that creates or writes a table
  with SQL against `lake`. There is no interactive shell on purpose; ad-hoc
  SQL is `query --sql` or the console's SQL page.
- **PyIceberg** creates and drops tables and namespaces, commits rows, and
  reads metadata, all through `data.catalog_client()`, a REST catalog client
  asking for vended credentials. Anything about a table's shape or history —
  schema evolution, snapshots, properties — goes here, as a library call.
- **`load` is the handoff.** DuckDB reads the file, applies
  `ICEBERG_WIDENING`, and streams Arrow batches of `LOAD_BATCH_ROWS`;
  PyIceberg creates the table from the first batch's schema and appends the
  reader. Keep the widening on the DuckDB side: PyIceberg maps `uint32` to
  `int` and `uint64` to `long`, which overflow, where DuckDB's casts widen.

Every call opens its own connections and closes them; there is no shared
state and no DuckDB file. Do not reintroduce a container or a long-running
process to "save" the connection cost — it is tens of milliseconds, measured.

The environment is a uv project. `pyproject.toml` pins `duckdb==` and
`pyiceberg==` exactly: the Iceberg extension is built per engine release,
and PyIceberg's write path and type mapping move between releases, so a
version change is a deliberate act — edit the pin, `uv lock`, `make smoke`.
`.python-version` and `uv.lock` are committed; everything runs through
`uv run --frozen` (the Makefile's `NQLAKE`, the console's `lib/nqlake.ts`),
never a bare `python3`.

Two host-side facts follow from running outside the compose network:

- The catalog vends MinIO at `http://minio:<port>`, so the host needs
  `127.0.0.1 minio` in `/etc/hosts`. `data._failure` appends that
  instruction when a DuckDB error names a host this machine cannot resolve.
  Do not "fix" this by changing the storage profile to `localhost` (Lakekeeper
  itself would lose MinIO) or by giving DuckDB a static S3 key.
- `stack.py` adds the stack's names to `NO_PROXY` at import, and
  `connect()` sets DuckDB's `http_proxy` to empty after the extension
  install. Everything either engine talks to is local, and a proxy in the
  user's environment would swallow the MinIO requests.

## No address is written down twice

`data.attach_sql()` and `data.catalog_client()` read the warehouse name and
the catalog port from `.env` when a connection is opened; every DuckDB
client goes through `data.connect()`, every PyIceberg client through
`data.catalog_client()`. Keep it that way: a literal in the code goes stale
the moment a port or the warehouse name changes, and it fails at query time
rather than at startup.

## Console and CLI

`backend/nqlake.py` is one backend with two front ends: it prints tables on a
TTY and JSON when piped, and the Next.js API routes shell out to it with
`--json`. New functionality goes into the CLI first — a route that talks to a
service directly instead of through `nqlake.py` puts the console and the
command line out of step. Inside the CLI it goes to the engine the rule above
assigns: a read is DuckDB, a change to a table is PyIceberg. The one route
with logic of its own is `upload`, and that logic is only "write the body to
`images/duckdb/work`, then run `load`".

A table can be larger than memory, and a query's rows are materialized in
the backend process. `rows` therefore pages with `LIMIT/OFFSET`; do not add a
call that reads a table whole.

The console executes admin operations and arbitrary SQL against the stack, and
the catalog runs without auth. It is a localhost tool; do not expose it.

## Commits

One change per commit, imperative subject, body explaining why. Never commit
`.env`, `images/`, `.venv/`, or `ui/node_modules`. `uv.lock` is committed.
