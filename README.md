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
Iceberg REST catalog on Postgres, and DuckDB as the query engine — one
compose project with a web console and a CLI.

```
DuckDB ──── Iceberg REST ────► Lakekeeper ────► Postgres   (catalog metadata)
   │                               │
   │◄── vended STS credentials ────┘
   ▼
 MinIO  s3://lakehouse/warehouse/…  (Parquet data + Iceberg metadata)
```

| Component | Role | Image |
|---|---|---|
| MinIO | object store | `lakehouse/minio` |
| Postgres 17 | Lakekeeper metadata DB | `lakehouse/postgres` |
| Lakekeeper v0.13.1 | Iceberg REST catalog | `lakehouse/lakekeeper` |
| DuckDB v1.5.5 | query engine / SQL client | `lakehouse/duckdb` |
| mc | one-shot MinIO provisioning | `lakehouse/mc` |

Dockerfiles live in the parent repository under `Dockerfiles/lakehouse-*`;
this directory holds everything else.

## Quick start

```bash
cp .env.example .env   # then set the passwords; .env is gitignored
make up      # start stores + catalog, run init jobs (bucket, user, warehouse)
make smoke   # end-to-end check: write + read an Iceberg table
make console # web console on http://localhost:3000
make down    # stop; data survives in images/
make clean   # stop and DELETE all data
```

`make up` is idempotent — it re-runs provisioning and bootstrap, then leaves
the services running.

## Structure

```
compose.yaml        the whole service: minio → minio-init → postgres
                    → lakekeeper-migrate → lakekeeper → lakekeeper-init
.env.example        credential/name template; copy to .env (gitignored)
Makefile            command surface (up/down/sql/status/load/console/…)
scripts/            minio-init.sh, lakekeeper-init.sh (idempotent init jobs),
                    smoke-test.sh
scripts/console/    nqlake.py  CLI entry: argument parsing + table/JSON output
                    stack.py   compose/env/HTTP helpers; status/stats/ops/logs
                    data.py    catalog browsing, DuckDB query, file loading
sql/attach.sql      attaches the catalog as `lake` in every DuckDB client
ui/                 NQ Lake console (Next.js); API routes shell out to nqlake.py
                    (see ui/README.md)
images/             bind-mounted service state (gitignored), one dir per service:
  minio/data/         bucket contents — the actual Parquet + metadata files
  postgres/data/      catalog database
  duckdb/work/        client scratch, mounted at /work (load staging area)
  console/state/      console bookkeeping (last smoke-test result)
```

## Usage

### Web console

`make console` → http://localhost:3000. Four pages:

- **Overview** — per-component health, CPU/memory sparklines, coordination
  links (Lakekeeper↔Postgres, Lakekeeper↔MinIO, DuckDB↔stack), storage and
  catalog-API activity
- **Catalog** — namespaces, table schema/snapshots, row preview
- **SQL** — DuckDB against the catalog
- **Operations** — start/stop/restart services, stack up, smoke test, logs

Needs only Node and Docker; all data comes through `nqlake.py`. The console
executes admin operations and arbitrary SQL — keep it on localhost.
[`ui/README.md`](ui/README.md) documents its routes, polling, and timeouts.

### Command line

`scripts/console/nqlake.py` prints tables on a TTY and JSON when piped
(`--pretty` / `--json` override), so the same commands serve humans and
scripts:

| Command | Does |
|---|---|
| `status` | component + coordination health (`make status`) |
| `stats` | container CPU/mem, storage, catalog API usage |
| `catalog [--table ns.t]` | list namespaces/tables, or schema + snapshots of one |
| `query --sql "…"` | run SQL via DuckDB, catalog attached as `lake` |
| `load --file f --table ns.t [--replace]` | load a data file into an Iceberg table |
| `ops --action …` | start/stop/restart/stack-up/stack-stop/smoke |
| `logs --service …` | tail a service's logs |

Every `query` and `load` starts a throwaway DuckDB container, which costs
about four seconds before any work begins — put several statements into one
`--sql` rather than issuing several calls.

### Common operations

**Check the stack.** `status` is the one to run after `make up` or when
something looks wrong; `stats` answers "how big is it now".

```bash
make status
python3 scripts/console/nqlake.py --pretty stats
```

**Load a file.** The first load creates the namespace and table with an
inferred schema, later loads append by column name, and `--replace` rebuilds
the table from scratch.

```bash
make load FILE=~/data/trades-2026-08.csv TABLE=market.trades
python3 scripts/console/nqlake.py load --file quotes.parquet --table market.quotes
python3 scripts/console/nqlake.py load --file trades.csv --table market.trades --replace
```

CSV/TSV/Parquet/JSON(L), optionally gzipped. The file may live anywhere on the
host — `load` stages it through `images/duckdb/work` and removes the copy
afterwards.

**Load many files at once.** One `load` per file pays the container startup
every time. Stage them under `images/duckdb/work` (mounted at `/work`) and let
DuckDB glob them in a single statement instead:

```bash
cp ~/data/trades-2026-*.csv.gz images/duckdb/work/
python3 scripts/console/nqlake.py --pretty query --sql "
  CREATE SCHEMA IF NOT EXISTS lake.market;
  CREATE TABLE lake.market.trades AS SELECT * FROM '/work/trades-2026-*.csv.gz';"
```

**Inspect a table** — schema, snapshot count, current row count, and where it
sits in the bucket:

```bash
python3 scripts/console/nqlake.py --pretty catalog
python3 scripts/console/nqlake.py --pretty catalog --table market.trades
```

**Query.** `--limit` caps the rows returned (default 500, the full count is
still reported), `--timeout` the wall clock (default 90 s).

```bash
python3 scripts/console/nqlake.py --pretty query --limit 20 --sql \
  "SELECT sym, count(*) AS n, avg(px) AS px FROM lake.market.trades GROUP BY sym ORDER BY n DESC"
```

**Export a result.** `/work` in the container is `images/duckdb/work` on the
host, so anything written there is immediately at hand:

```bash
python3 scripts/console/nqlake.py --pretty query --sql \
  "COPY (SELECT * FROM lake.market.trades WHERE ts >= '2026-08-01') TO '/work/aug.parquet';"
ls -lh images/duckdb/work/aug.parquet
```

**Script against it.** Piped output is a single JSON object, so health checks
and row counts compose with `jq`:

```bash
python3 scripts/console/nqlake.py status | jq -e '.links["lakekeeper-minio"].ok'
python3 scripts/console/nqlake.py query --sql "SELECT count(*) AS n FROM lake.market.trades" \
  | jq '.rows[0].n'
```

**Operate the services.** `ops` takes start/stop/restart/stack-up/stack-stop/
smoke; the per-service actions need `--service`.

```bash
python3 scripts/console/nqlake.py --pretty ops --action restart --service lakekeeper
python3 scripts/console/nqlake.py --pretty logs --service minio --tail 50
make down    # stop; data survives in images/
make clean   # stop and DELETE every object plus the catalog database
```

`make smoke` writes and reads a table under the `smoke` namespace — useful
against a scratch stack, but it leaves that data behind.

### SQL shell

`make sql` opens DuckDB with the catalog already attached:

```sql
CREATE SCHEMA lake.market;
CREATE TABLE lake.market.trades (ts TIMESTAMP, sym VARCHAR, px DOUBLE, qty BIGINT);
INSERT INTO lake.market.trades VALUES (now(), 'AAPL', 231.5, 100);
SELECT * FROM lake.market.trades;
```

Every write becomes Parquet + Iceberg metadata under
`s3://lakehouse/warehouse/` in MinIO.

### Other engines

Any Iceberg client (PyIceberg, Spark, Trino, …) can attach the same catalog
at `http://localhost:8181/catalog` (no auth) and read/write the same tables.

## Endpoints and credentials

| Port | What |
|---|---|
| 3000 | NQ Lake console (`make console`) |
| 8181 | Lakekeeper: REST catalog `/catalog`, management `/management`, UI `/ui` |
| 9000 | MinIO S3 API |
| 9001 | MinIO web console |

Credentials live in `.env`, which is gitignored — see
[.env.example](.env.example) for the keys. Postgres is not published to the
host.

## Notes

- The catalog runs **without auth**, and MinIO STS vends short-lived
  credentials to DuckDB per table access — clients need no S3 secret.
- MinIO refuses `AssumeRole` for root credentials, so `minio-init` creates
  the dedicated `lakekeeper` user that the warehouse is registered with.
- Renaming the warehouse means changing both `LAKEHOUSE_WAREHOUSE` in `.env`
  and the `ATTACH` line in `sql/attach.sql`.

## Releases

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
- **One command surface, two front ends.** `scripts/console/nqlake.py` prints
  tables on a TTY and JSON when piped, so the same commands serve humans,
  scripts, and the Next.js console's API routes.
- **`load` infers schemas.** CSV/TSV/Parquet/JSON(L), optionally gzipped; the
  first load creates the namespace and table, later loads append by column
  name, `--replace` rebuilds.
- Data lives in `images/` as bind mounts and survives `make down`. Only
  `make clean` deletes it.
