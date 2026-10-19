<img src="https://capsule-render.vercel.app/api?type=waving&height=400&text=NQ%20Lake&fontAlign=80&fontAlignY=40&color=gradient" />

<p align="center">
  <img alt="Apache Iceberg" src="https://img.shields.io/badge/Apache-Iceberg-1F6FEB?logo=apacheiceberg&logoColor=white" />
  <img alt="DuckDB 1.5.5" src="https://img.shields.io/badge/DuckDB-1.5.5-FFF000?logo=duckdb&logoColor=black" />
  <img alt="MinIO" src="https://img.shields.io/badge/MinIO-S3%20storage-C72E49?logo=minio&logoColor=white" />
  <img alt="Postgres 17" src="https://img.shields.io/badge/Postgres-17-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
  <img alt="Console: Next.js" src="https://img.shields.io/badge/console-Next.js-000000?logo=nextdotjs&logoColor=white" />
</p>

Release notes: [0.5.0](docs/release-notes/0.5.0.md), Arrow streams over a Unix
socket, [0.4.0](docs/release-notes/0.4.0.md), the console on NQUI,
[0.3.0](docs/release-notes/0.3.0.md), the console's HeroUI migration, [0.2.0](docs/release-notes/0.2.0.md), the console, and
[0.1.0](docs/release-notes/0.1.0.md), the backend API.

## Console

The Next.js console provides a workspace overview, a namespace and table
catalog, a SQL workspace, Parquet import, and service health checks. It is built
entirely from the [NQUI](https://github.com/Zhou-London/nqui) component kit
(`@nowquant/nqui`, on React Aria and Tailwind CSS v4) with Lucide icons; forms
use NQUI's `Form` with native validation.

Run `npm install` and `npm run dev` from `console/`, then open
`http://127.0.0.1:<CONSOLE_PORT>`. The launcher reads `CONSOLE_PORT` from the
root `.env`. The console proxies `/api/lake/*` to the local backend using
`API_PORT` from the same file; browser requests stay on the console origin.
Start the backend with the existing `make up` or `make api` command.

The catalog supports table schemas, row previews, filtering, CSV export,
renaming, adding nullable columns, and appending JSON rows. Removing a table
from the catalog preserves its storage files. Row deletion and table removal
require the full table name as confirmation.

Parquet import takes several files for one table and inspects each before
writing; a file the backend rejects or a conversion that loses precision
opens a warning first, and an existing table can be picked from the
catalog. Overwrites and lossy type repairs require explicit confirmation. The SQL workspace uses the backend's
read-only query endpoint; query history lasts until the page is left.
Use Cmd/Ctrl+K to search and Cmd/Ctrl+Enter to run a query. The
"Streaming" toggle in the editor toolbar switches the workspace to
`/query/arrow`: Run then sends every row of the statement, with no row
limit, to a TCP port as an Arrow IPC stream, with the batch size
and port from the toolbar's settings popover. The workspace lists the
backend's transfers whenever one is open: each waiting or running one with
its address, its log, and a button that abandons or closes it, and the
recent finished ones with their logs. The browser cannot read the stream
itself, so the transfer is consumed by a separate process, on this machine
or on any machine that can reach the port.

Run `npm run typecheck`, `npm test`, and `npm run build` in `console/` to
validate the console. If a restricted environment blocks Turbopack's worker
ports, use `npm run build -- --webpack`. Start a production build with
`npm start`.

## Backend API

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
| GET, POST | `/query/arrow` | Lists transfers (the open ones and the last 20 finished, with their logs), or binds a TCP port and sends every row of a read-only SQL result to it as an Arrow IPC stream |
| DELETE | `/query/arrow/{id}` | Stops a transfer: unbinds a waiting port, or cuts the stream a receiver is reading |

`/query` runs on one DuckDB database per process, opened on the first query
and attached read-only to the catalog; each request gets its own cursor.
Rows appended or deleted through the API are visible to the next query. A
change to a table's columns shows up in `/query` about one second later;
`GET .../tables/{table}` shows it at once.

`POST /query/arrow` moves a whole result, however large, out of band. The
HTTP call is only the trigger: the backend binds a TCP port on `ARROW_HOST`,
answers 202 with the transfer's `id`, `host`, and `port`, and a thread waits
for one receiver to connect. The receiver then reads one Arrow IPC stream from the
connection: the schema, one record batch of `batch_size` rows at a time
(default 65536, at most 1000000), and the end-of-stream marker. DuckDB
produces each batch when the writer asks for it, so neither side holds the
result whole. The port is `ARROW_PORT` from `.env` (default 40005) unless
the body sets `port`; `port: 0` binds any free port, which the response
names. One transfer runs per port at a time. `ARROW_HOST` is `0.0.0.0` by
default, so a receiver on another machine connects to this machine's
address on the port; the stream has no authentication, so anyone who can
reach the port reads the result, and `ARROW_HOST=127.0.0.1` keeps it to
local receivers. The port stays bound until a receiver connects: nothing
expires on its own. `DELETE /query/arrow/{id}` stops a transfer, unbinding
a waiting port or cutting the stream a receiver is reading, and answers
with the transfer as it ended, 404 for an unknown id, or 409 once it had
already ended. `GET /query/arrow` lists every open transfer and the last 20
finished ones, each with its state (`waiting`, `running`, `done`, `failed`,
`abandoned`, `closed`), the rows sent, the receiver's address, and a log of
what happened. A rejected statement answers 422 before the port is bound; a
DuckDB error after the stream began, or a stop while a receiver reads, ends
the stream with a truncated message, so the reader raises instead of
returning the rows so far as a complete result.

```python
import socket

import pyarrow as pa
import requests

transfer = requests.post(
    "http://localhost:40004/query/arrow",
    json={"sql": "SELECT * FROM lake.raw.trades", "batch_size": 65536},
).json()
with socket.create_connection((transfer["host"], transfer["port"])) as sock:
    with pa.ipc.open_stream(sock.makefile("rb")) as reader:
        for batch in reader:
            process(batch)
```

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
