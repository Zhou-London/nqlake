# NQ Lake

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

Loading data:

```bash
make load FILE=trades.csv TABLE=market.trades
# equivalently:
python3 scripts/console/nqlake.py load --file trades.csv --table market.trades
```

`load` accepts CSV/TSV/Parquet/JSON(L), also gzipped. First load creates the
namespace and table (schema inferred); later loads append by column name;
`--replace` rebuilds the table.

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
