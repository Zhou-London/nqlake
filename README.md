<img src="https://capsule-render.vercel.app/api?type=waving&height=400&text=NQ%20Lake&fontAlign=80&fontAlignY=40&color=gradient" />

<p align="center">
  <img alt="Apache Iceberg" src="https://img.shields.io/badge/Apache-Iceberg-1F6FEB?logo=apacheiceberg&logoColor=white" />
  <img alt="DuckDB 1.5.5" src="https://img.shields.io/badge/DuckDB-1.5.5-FFF000?logo=duckdb&logoColor=black" />
  <img alt="MinIO" src="https://img.shields.io/badge/MinIO-S3%20storage-C72E49?logo=minio&logoColor=white" />
  <img alt="Postgres 17" src="https://img.shields.io/badge/Postgres-17-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
  <img alt="Console: Next.js" src="https://img.shields.io/badge/console-Next.js-000000?logo=nextdotjs&logoColor=white" />
</p>
## Console

The Next.js console browses Iceberg tables, runs read-only SQL, and displays
service health. The UI is built with Tailwind CSS and shadcn/ui components,
Lucide icons, and react-hook-form with zod validation for every dialog. It
follows the system light or dark theme; a header toggle overrides it.

`make up` starts the console alongside the API and storage services. Install
Node.js 22.9 or later and npm first. The first start installs the locked npm
dependencies and builds the console. Open `http://localhost:40001` when using
the example configuration. `CONSOLE_PORT` in the root `.env` sets this port;
`API_PORT` sets the Python API connection. The console binds to loopback.

- `make console` runs the development server in the foreground. Stop the
  background console with `make console-stop` first.
- `make console-start` installs dependencies, builds, and starts the production
  console. A running console is left in place; stop it first to rebuild changes.
- `make console-stop` stops the console. `make down` stops the whole stack.
- `make console-logs` follows the console log.

The table browser supports name search, namespace filtering, column details,
and snapshot metadata. Data previews return up to 500 rows and accept Iceberg
filter expressions such as `price > 10`. Pagination moves through the returned
rows, with 50 rows per page. **Export CSV** downloads the returned result.
Press Cmd+K or Ctrl+K to open table search.

Use **Namespaces** to create namespaces or drop empty ones. **Create table** accepts column names, Iceberg types, required flags, partition expressions,
and table properties. Open a table and choose **Manage** to rename it, add
columns, or update properties. Removing a key from the properties JSON removes that property.
**Metadata → Drop table** requires the table name as confirmation. Stored files are retained
unless you select the option to permanently delete them.

**Import data** imports Parquet into a new or existing table in a namespace. Select a
file and choose **Inspect file** to review its columns and type repairs. Uploads
append by default. Replacing all rows requires the table name as confirmation;
lossy type repairs require a separate acknowledgment. The result reports the
written row count and repairs. Multipart uploads stream through the console to
the API, with a ten-minute request timeout. After a connection failure, check
the table before retrying because the write may have completed.

The SQL workspace sends one read-only statement to DuckDB through `/query`.
Select a table to generate its SQL path, or enter SQL directly. Press
Cmd+Enter or Ctrl+Enter to execute. The result limit ranges from 100 to 10,000
rows. Large integer values, including snapshot IDs, display without rounding.
Service health refreshes every 30 seconds while the console is open;
failed checks display an error and mark earlier results as stale.

The browser calls the console's `/api` routes. Next.js forwards supported
reads, table management requests, Parquet uploads, and SQL queries to the Python
API on loopback. Storage credentials stay on the server. The frontend lives in
`console/` and follows the
[Next.js App Router](https://nextjs.org/docs/app/getting-started/installation).
Generated shadcn/ui primitives live in `console/components/ui`; the console's
own components live in `console/components/console`, with the form schemas in
`console/lib/schemas.ts`. Add primitives with `npx shadcn add <component>`
from `console/`.

## Backend API

Release notes live in [docs/release-notes](docs/release-notes/0.1.0.md).

`make up` starts a FastAPI backend on `API_PORT` from `.env` (default 40004)
as a background process on the host, next to the compose stack; `make down`
stops both. `/docs` holds the interactive OpenAPI page. `make api-logs`
follows its log, and `make api` runs it in the foreground instead.

The code under `backend/nqlake` has two layers. `nqlake.lake` talks to the
systems: PyIceberg for namespaces, tables, and rows through the Lakekeeper
REST catalog, DuckDB for read-only SQL over the same catalog. `nqlake.api` is
the HTTP surface only: routes, request and response models, and the mapping
from lake errors to status codes. Every table the API creates uses Iceberg
format version 2, the newest version PyIceberg 0.12 writes.

| Method | Path | Does |
|---|---|---|
| GET | `/status` | Probes Lakekeeper, MinIO, Postgres, the catalog, and DuckDB |
| GET, POST | `/namespaces` | Lists or creates namespaces |
| DELETE | `/namespaces/{ns}` | Drops an empty namespace |
| GET, POST | `/namespaces/{ns}/tables` | Lists tables, or creates one from column specs |
| GET, PATCH, DELETE | `/namespaces/{ns}/tables/{table}` | Describes, alters (rename, properties, add columns), or drops a table |
| GET, POST, DELETE | `/namespaces/{ns}/tables/{table}/rows` | Reads rows by Iceberg filter, appends JSON rows, deletes by filter |
| POST | `/namespaces/{ns}/tables/{table}/parquet` | Uploads a Parquet file: `mode=append|overwrite`, `create=true` makes the table from the file's schema |
| POST | `/parquet/inspect` | Reports the Iceberg type of each column and the repairs an upload would apply, without writing |
| POST | `/query` | Runs read-only SQL with DuckDB; tables are `lake.<namespace>.<table>` |

`/query` runs on one DuckDB database per process, opened on the first query
and attached read-only to the catalog; each request gets its own cursor.
Rows appended or deleted through the API are visible to the next query. A
change to a table's columns shows up in `/query` about one second later;
`GET .../tables/{table}` shows it at once.

Errors share one shape, `{"error": "...", "problems": [...]}`, with one
problem per column when a schema is rejected.

### Parquet types Iceberg lacks

An upload repairs what it can and reports every repair in the response.

Lossless repairs, applied without asking:

- unsigned integers widen (`uint64` becomes `decimal(20,0)`)
- `float16` becomes `float`
- dictionary-encoded columns are decoded
- `decimal256` becomes `decimal128` when it fits 38 digits
- `date64` becomes `date`
- timestamps in a non-UTC zone are converted to UTC; the instants stay the same
- large lists and fixed-size lists become lists

One repair loses precision and is flagged `lossy` in the report: nanosecond
timestamps and times are truncated to microseconds, the finest precision the
v2 spec stores.

Everything else is rejected, with the column named and the fix stated:

- duration and interval columns
- decimals above 38 digits
- a column whose every value is null, so no type is stored
- a schema with repeated column names
