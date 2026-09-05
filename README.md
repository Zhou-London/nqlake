<img src="https://capsule-render.vercel.app/api?type=waving&height=400&text=NQ%20Lake&fontAlign=80&fontAlignY=40&color=gradient" />

<p align="center">
  <img alt="Apache Iceberg" src="https://img.shields.io/badge/Apache-Iceberg-1F6FEB?logo=apacheiceberg&logoColor=white" />
  <img alt="DuckDB 1.5.5" src="https://img.shields.io/badge/DuckDB-1.5.5-FFF000?logo=duckdb&logoColor=black" />
  <img alt="MinIO" src="https://img.shields.io/badge/MinIO-S3%20storage-C72E49?logo=minio&logoColor=white" />
  <img alt="Postgres 17" src="https://img.shields.io/badge/Postgres-17-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
  <img alt="Console: Next.js" src="https://img.shields.io/badge/console-Next.js-000000?logo=nextdotjs&logoColor=white" />
</p>

Project of NowQuant.

A self-contained Iceberg lakehouse: Parquet files in object storage, an
Iceberg REST catalog on Postgres, DuckDB as the query engine, and PyIceberg
as the table manager — the stores and the catalog as one compose project,
the two engines in-process in the CLI and the console backend, under a
Python pinned by uv. DuckDB computes; PyIceberg manages.

```
PyIceberg  (create / load / drop) ──┐
                                    ├─ Iceberg REST ──► Lakekeeper ──► Postgres  (catalog metadata)
DuckDB     (query / read-only)   ───┘                      │
   │                                                       │
   │◄─────────────── vended STS credentials ───────────────┘
   ▼
 MinIO  s3://lakehouse/warehouse/…  (Parquet data + Iceberg metadata)
```

| Component | Role | Image |
|---|---|---|
| MinIO | object store | `lakehouse/minio` |
| Postgres 17 | Lakekeeper metadata DB | `lakehouse/postgres` |
| Lakekeeper v0.13.1 | Iceberg REST catalog | `lakehouse/lakekeeper` |
| DuckDB v1.5.5 | query engine: SQL, table reads, file parsing | none: in-process, pinned in `pyproject.toml` |
| PyIceberg 0.12 | table manager: create, load, drop, metadata | none: in-process, pinned in `pyproject.toml` |
| mc | one-shot MinIO provisioning | `lakehouse/mc` |
| bash + curl + jq | one-shot catalog bootstrap | `lakehouse/init` |

Dockerfiles live in the parent repository under `Dockerfiles/lakehouse-*`;
`DOCKERFILES_DIR` in `.env` is the absolute path of that directory, and this
directory holds everything else.

Needs Docker, [uv](https://docs.astral.sh/uv/) (it fetches the pinned Python
itself), and Node for the console. One line of `/etc/hosts` as well: the
catalog stores MinIO's address as `http://minio:<port>` — its name on the
compose network — and vends that address, with short-lived credentials, to
every client. Ports are the same on both sides of the network, so on the host
the name just has to point at loopback:

```bash
echo '127.0.0.1 minio' | sudo tee -a /etc/hosts
```

Without it the catalog works but every table read or write fails at MinIO;
the error says which name to map.

## Quick start

```bash
cp .env.example .env   # then set the passwords; .env is gitignored
make up      # python env (uv sync), then stores + catalog + init jobs (bucket, user, warehouse)
make smoke   # end-to-end check: write + read an Iceberg table
make ports   # the port each component binds, and whether the stack matches
make console # web console on the console port from .env (3000 by default)
make down    # stop; data survives in images/
make clean   # stop and DELETE all data
```

`make up` is idempotent — it re-runs provisioning and bootstrap, then leaves
the services running. The first DuckDB call after a fresh checkout downloads
the `httpfs` and `iceberg` extensions into `images/duckdb/extensions/` (a few
seconds, once); nothing else reaches the network.

Two engines share the work, and the line between them is the design:

- **DuckDB computes.** Every query, every page of rows, and the parsing of a
  file being loaded. Its attach to the catalog is read-only.
- **PyIceberg manages.** Creating tables and namespaces, committing rows,
  dropping, and reading metadata, all through the REST catalog. A table is
  never created or written by SQL against `lake`; `query` and the SQL page
  refuse it.

`load` is where they meet: DuckDB reads the file and casts what Iceberg
lacks, PyIceberg creates the table from the resulting schema and commits the
batches.

The Makefile is the whole command surface:

| Target | Does |
|---|---|
| `up` | Syncs the Python environment, starts the stores and the catalog, then runs the init jobs |
| `status` | Prints component and coordination health |
| `ports` | Prints the port each component binds, and where the stack differs |
| `load FILE=f TABLE=ns.t` | Loads a data file into an Iceberg table |
| `console` | Runs the web console in development mode on `CONSOLE_PORT` |
| `console-build` | Builds the web console, then serves the build on `CONSOLE_PORT` |
| `smoke` | Writes and reads an Iceberg table end to end |
| `ps` | Lists the compose services and their state |
| `logs` | Follows Lakekeeper's log |
| `down` | Stops the stack; data survives in `images/` |
| `clean` | Stops the stack and deletes every object plus the catalog database |

## Structure

```
compose.yaml        the stores and the catalog: minio → minio-init → postgres
                    → lakekeeper-migrate → lakekeeper → lakekeeper-init
.env.example        credential/name template; copy to .env (gitignored)
pyproject.toml      the Python side: DuckDB pinned exactly; .python-version
uv.lock             and uv.lock pin the interpreter and the resolution
Makefile            command surface (up/down/status/load/ports/console/…)
backend/            nqlake.py  CLI entry: argument parsing, table/JSON output
                    stack.py   compose/HTTP helpers; status/stats/ops/logs
                    data.py    catalog/load/drop/smoke (PyIceberg), rows/query (DuckDB)
                    ports.py   the .env port registry: read, validate, write
                    minio-init.sh, lakekeeper-init.sh (idempotent init jobs)
ui/                 NQ Lake console (Next.js); API routes shell out to nqlake.py
                    (see ui/README.md)
images/             service state (gitignored), one dir per service:
  minio/data/         bucket contents — the actual Parquet + metadata files
  postgres/data/      catalog database
  duckdb/work/        console upload scratch
  duckdb/extensions/  DuckDB's httpfs + iceberg extensions, fetched once
```

## Usage

### Web console

`make console` → the console port from `.env` (http://localhost:3000 unless
you moved it). Four pages:

- **Overview** — per-service state, CPU/memory sparklines, PIDs and I/O,
  start/restart/stop; init-job state; stack up, smoke test, stop; on-disk
  sizes; a log tail per service
- **Tables** — namespaces and tables, schema and snapshot summary, rows one
  page at a time (a table may be larger than the browser), file upload into a
  new or existing table, drop table
- **SQL** — DuckDB against the catalog, read-only
- **Ports** — the port each component binds, whether the running stack still
  matches, and an edit that writes the new value to `.env`

Needs Node, Docker, and uv; all data comes through `nqlake.py`. The console
executes admin operations, drops tables, and runs arbitrary SQL — keep it on
localhost. [`ui/README.md`](ui/README.md) documents its routes, paging, and
timeouts.

### Command line

`backend/nqlake.py` runs under the uv environment (`uv run python
backend/nqlake.py …`; the Makefile targets wrap the common ones). It prints
tables on a TTY and JSON when piped (`--pretty` / `--json` override), so the
same commands serve humans and scripts:

| Command | Does |
|---|---|
| `status` | component + coordination health (`make status`) |
| `stats` | container CPU/mem/IO, on-disk size per service |
| `catalog [--table ns.t]` | list namespaces/tables, or schema + snapshots of one |
| `rows --table ns.t [--offset n] [--limit n]` | one page of a table's rows |
| `query --sql "…"` | run SQL via DuckDB, catalog attached read-only as `lake` |
| `load --file f --table ns.t [--replace]` | load a data file (or a glob of files) into an Iceberg table |
| `drop --table ns.t` / `drop --namespace ns` | drop a table (data purged) or an empty namespace |
| `ports [--set KEY=PORT]` | show the stack's ports, or reassign one (`make ports`) |
| `ops --action …` | start/stop/restart/stack-up/stack-stop/smoke |
| `logs --service …` | tail a service's logs |

Every call opens fresh in-process engines and closes them; the overhead is a
few tens of milliseconds, so a call is as expensive as the work in it.

### Common operations

**Check the stack.** `status` is the one to run after `make up` or when
something looks wrong; `stats` answers "how big is it now".

```bash
make status
uv run python backend/nqlake.py --pretty stats
```

**Load a file.** The first load creates the namespace and table with the
file's schema, later loads append by column name (a file may omit columns,
which come back NULL, but not add any), and `--replace` drops and recreates
the table.

```bash
make load FILE=~/data/trades-2026-08.csv TABLE=market.trades
uv run python backend/nqlake.py load --file quotes.parquet --table market.quotes
uv run python backend/nqlake.py load --file trades.csv --table market.trades --replace
```

CSV/TSV/Parquet/JSON(L), optionally gzipped. The file may live anywhere on the
host; DuckDB reads it in place.

Iceberg has no 8/16-bit or unsigned integers and no nanosecond timestamps, so
a file with such columns (pandas `uint8`, `datetime64[ns]`) cannot be stored
as is. When `load` creates a table it widens those columns to the narrowest
Iceberg type that holds them (`UTINYINT` → `INTEGER`, `UBIGINT` →
`DECIMAL(20,0)`, `TIMESTAMP_NS` → `TIMESTAMP`, …) and lists the casts in its
output; the full table is `ICEBERG_WIDENING` in `backend/data.py`.

**Load many files at once.** `--file` takes a glob; the files are read as one
stream and committed in batches of a million rows, one data file each.

```bash
uv run python backend/nqlake.py --pretty load --file '~/data/trades-2026-*.csv.gz' --table market.trades
```

**Inspect a table** — schema, snapshot count, current row count, and where it
sits in the bucket; then page through it:

```bash
uv run python backend/nqlake.py --pretty catalog
uv run python backend/nqlake.py --pretty catalog --table market.trades
uv run python backend/nqlake.py --pretty rows --table market.trades --offset 1000 --limit 50
```

**Drop a table.** Goes through the catalog, so it is instant and purges the
data files; a namespace can be dropped once it is empty.

```bash
uv run python backend/nqlake.py drop --table market.trades
uv run python backend/nqlake.py drop --namespace market
```

**Query.** `--limit` caps the rows returned (default 500, the full count is
still reported), `--timeout` the wall clock (default 90 s). The catalog is
attached read-only; `CREATE`, `INSERT`, and `DROP` against `lake` are
refused, that work goes through `load` and `drop`.

```bash
uv run python backend/nqlake.py --pretty query --limit 20 --sql \
  "SELECT sym, count(*) AS n, avg(px) AS px FROM lake.market.trades GROUP BY sym ORDER BY n DESC"
```

**Export a result.** DuckDB runs on the host, so `COPY … TO` writes wherever
you point it:

```bash
uv run python backend/nqlake.py --pretty query --sql \
  "COPY (SELECT * FROM lake.market.trades WHERE ts >= '2026-08-01') TO '~/data/aug.parquet';"
```

**Script against it.** Piped output is a single JSON object, so health checks
and row counts compose with `jq`:

```bash
uv run python backend/nqlake.py status | jq -e '.warehouse.status == "active"'
uv run python backend/nqlake.py query --sql "SELECT count(*) AS n FROM lake.market.trades" \
  | jq '.rows[0].n'
```

**Move a port.** Every port the stack binds is a variable in `.env`, and one
number serves both sides — what a service listens on and what it publishes.
`ports` shows them and reassigns them; a value that is out of range, collides
with another component, or is already taken on the host is refused rather than
written.

```bash
make ports   # VARIABLE, SERVICE, PORT, STATE (live / restart / -), WHAT
uv run python backend/nqlake.py --pretty ports --set MINIO_API_PORT=9100
make up      # recreates the services whose mapping moved
```

MinIO is the one with state behind it: its address is stored in the
warehouse's storage profile, so `lakekeeper-init` writes the new endpoint back
on the next `make up`. Moving `CONSOLE_PORT` needs `make console` restarted
instead of the stack.

**Operate the services.** `ops` takes start/stop/restart/stack-up/stack-stop/
smoke; the per-service actions need `--service`.

```bash
uv run python backend/nqlake.py --pretty ops --action restart --service lakekeeper
uv run python backend/nqlake.py --pretty logs --service minio --tail 50
make down    # stop; data survives in images/
make clean   # stop and DELETE every object plus the catalog database
```

`make smoke` has PyIceberg create and fill a table under the `smoke`
namespace and DuckDB read it back — one pass through both engines. It
leaves that namespace behind.

### Other engines

Any Iceberg client (PyIceberg, Spark, Trino, …) can attach the same catalog
at `http://localhost:8181/catalog` (no auth, or wherever `LAKEKEEPER_PORT`
now points) and read/write the same tables.

## Endpoints and credentials

| Variable | Default | What |
|---|---|---|
| `CONSOLE_PORT` | 3000 | NQ Lake console (`make console`) |
| `LAKEKEEPER_PORT` | 8181 | Lakekeeper: REST catalog `/catalog`, management `/management`, UI `/ui` |
| `MINIO_API_PORT` | 9000 | MinIO S3 API |
| `MINIO_CONSOLE_PORT` | 9001 | MinIO web console |
| `POSTGRES_PORT` | 5432 | catalog database |

The defaults are what `.env.example` carries; `make ports` shows what this
stack is actually on. Credentials live in `.env`, which is gitignored — see
[.env.example](.env.example) for the keys.

## Notes

- The catalog runs **without auth**, and MinIO STS vends short-lived
  credentials to DuckDB per table access — clients need no S3 secret.
- MinIO refuses `AssumeRole` for root credentials, so `minio-init` creates
  the dedicated `lakekeeper` user that the warehouse is registered with.
- No client carries the catalog address or the warehouse name: both engines
  read them from `.env` at connection time, so renaming the warehouse or
  moving the catalog port is a `.env` edit and nothing else.
- Both engines talk only to this stack, so the backend adds the stack's
  names to `NO_PROXY` and switches DuckDB's HTTP proxy off (after the
  one-time extension download, which may need it). A proxy would otherwise
  swallow the requests to MinIO.

## Releases

### 2026-09-05

DuckDB left the containers, and PyIceberg took over table management.

- **DuckDB computes, PyIceberg manages.** DuckDB's attach to the catalog is
  read-only: it runs queries, pages rows, and parses files. PyIceberg, the
  reference Python client, creates and drops tables and namespaces, commits
  rows, and reads metadata through the REST catalog. `load` hands DuckDB's
  Arrow batches to PyIceberg, a million rows per data file; `--file` now
  takes a glob. `query` and the SQL page refuse writes to `lake`.
  Schema evolution, snapshot management, and table properties are now a
  library call away instead of unsupported.
- **`make sql` is gone.** Nothing used the interactive shell; ad-hoc SQL is
  `query --sql` on the command line or the SQL page in the console. The
  attach SQL template went with it: with one DuckDB client left, the
  `ATTACH` is three lines in `data.py`, read from `.env` like everything
  else.

DuckDB left the containers. It is an in-process engine, and running it as a
compose service meant every query paid a container start, a dependency
check that re-ran both init jobs, and a cold load of the 45 MB `iceberg`
extension — four seconds before any work, plus a bind mount just to hand it
files.

- **DuckDB runs inside `nqlake.py`.** `rows`, `query`, `load`, and the
  smoke test open an in-memory DuckDB on the host and attach the catalog; the overhead per call went from about four seconds to tens of
  milliseconds. `load` reads files in place; `COPY … TO` writes anywhere.
- **The Python side is a uv project.** `pyproject.toml` pins DuckDB exactly,
  `.python-version` and `uv.lock` pin the interpreter (3.14) and the
  resolution; `make up` syncs the environment, and the console invokes the
  CLI through `uv run --frozen`. The version pin moved out of a Dockerfile,
  it did not go away.
- **One line of `/etc/hosts`.** The catalog vends MinIO at its compose name;
  the host needs `127.0.0.1 minio` to follow it. The error names the host to
  map when it is missing.
- **`lakehouse/duckdb` is `lakehouse/init`** in the parent repository: bash,
  curl, and jq for `lakekeeper-init`, and nothing else. The `duckdb` and
  `smoke-test` services, `duckdb-entrypoint.sh`, and `smoke-test.sh` are
  gone; `ops --action smoke` is the smoke test.
- **The backend's REST calls bypass any HTTP proxy.** They all go to this
  stack on localhost; a console started from an environment with `HTTP_PROXY`
  set and no `NO_PROXY` reported the catalog unreachable.
- **Loads widen what Iceberg lacks.** Iceberg has no 8/16-bit or unsigned
  integers and (at format v2) no nanosecond timestamps, so a Parquet file
  with a pandas `uint8` or `datetime64[ns]` column failed to create a table.
  `load` now casts such columns to the narrowest Iceberg type that holds them
  and reports the casts.

### 2026-09-04

The console was rebuilt around monitoring and table work, and the backend
shrank to what those need.

- **`scripts/` is `backend/`.** The Python that serves the CLI and the
  console's API routes, and the shell scripts the containers run, sit in one
  flat directory under the name that says what it is.
- **Overview does monitoring and operations together.** Per-service state,
  CPU/memory history, PIDs and I/O, on-disk sizes, start/restart/stop, stack
  up, smoke test, and a log tail on one page; the separate Operations page is
  gone. Lakekeeper's endpoint-statistics charts and the persisted "last smoke
  test" link are gone with it — the smoke test reports its result directly.
- **Tables replaces Catalog.** Rows are paged (`rows --offset --limit`, new on
  the CLI too) because a table can be larger than the browser; a file can be
  uploaded straight into a new or existing table; a table or an empty
  namespace can be dropped (`drop`, new on the CLI too, through the catalog).
- **`stats` is CPU, memory, I/O, and bytes on disk** — the API-activity
  series and the Parquet census are gone. `status` no longer probes each
  service itself: compose's health checks already do.

### 2026-09-01

- **The Makefile's targets are listed in full.** `ps`, `logs`, and
  `console-build` had no entry, so the only way to find them was to read the
  Makefile. The table after the quick start now names every target.

### 2026-08-22

Every port the stack binds became configurable, and nothing in the repository
writes one down twice.

- **Ports live in `.env`.** `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`,
  `LAKEKEEPER_PORT`, `POSTGRES_PORT`, and `CONSOLE_PORT` are read by
  `compose.yaml`, the init scripts, the Makefile, and the CLI alike, and one
  number serves both what a service listens on and what it publishes. A port
  literal anywhere else is now a bug.
- **`ports`, on both front ends.** `make ports` and the console's new Ports
  page show the configured value, what the running stack publishes, and where
  the two have drifted; `--set KEY=PORT` writes a new value after checking it
  is in range, unclaimed by another component, and free on the host.
- **The catalog follows MinIO.** MinIO's address is stored in the warehouse's
  storage profile, so `lakekeeper-init` now compares the two and repoints an
  existing warehouse instead of leaving it vending credentials for a dead
  address.
- **The attach SQL is a template.** `backend/duckdb-entrypoint.sh` renders
  `sql/attach.sql.template` into `/tmp/attach.sql` at container start, filling
  in the warehouse name and catalog endpoint from the environment, so no
  DuckDB client carries either.

### 2026-08-15

The first working stack: `make up` brings up storage, catalog, and both
clients, and `make smoke` writes and reads an Iceberg table end to end.

- **The stack** — MinIO for objects, Postgres 17 for catalog metadata,
  Lakekeeper v0.13.1 as the Iceberg REST catalog, DuckDB v1.5.5 as the query
  engine, wired by one compose file. Images are pinned in the parent repository
  under `Dockerfiles/lakehouse-*`.
- **Credential vending, not shared secrets.** Lakekeeper hands DuckDB
  short-lived MinIO STS credentials per table access, so no client holds an S3
  secret. `minio-init` creates a dedicated `lakekeeper` user for this because
  MinIO refuses `AssumeRole` for root credentials.
- **Idempotent bring-up.** `make up` re-runs provisioning and bootstrap on
  every invocation and converges, so it is safe to repeat against a live stack.
- **One command surface, two front ends.** `backend/nqlake.py` prints
  tables on a TTY and JSON when piped, so the same commands serve humans,
  scripts, and the Next.js console's API routes.
- **`load` infers schemas.** CSV/TSV/Parquet/JSON(L), optionally gzipped; the
  first load creates the namespace and table, later loads append by column
  name, `--replace` rebuilds.
- Data lives in `images/` as bind mounts and survives `make down`. Only
  `make clean` deletes it.
