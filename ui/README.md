# nqlake-console

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Backend: nqlake.py" src="https://img.shields.io/badge/backend-nqlake.py-3776AB?logo=python&logoColor=white" />
  <img alt="Runs on the host" src="https://img.shields.io/badge/runs-on%20the%20host-4c1" />
</p>

Web console for the NQ Lake stack. Next.js on the host; every page reads the
stack through `backend/nqlake.py`, so the console and the CLI report the same
numbers and run the same operations.

```bash
npm install
npm run dev     # `make console` one level up serves it on CONSOLE_PORT from .env
npm run build && npm run start   # production build, `make console-build`
```

Needs Node, uv (the backend runs under the stack's pinned Python; `make up`
creates that environment), and a Docker daemon that can see the compose
project. The stack itself does not have to be up: an absent component is
rendered as absent rather than as an error.

## Pages

- **Overview** — per-service state and health, CPU and memory sparklines,
  PIDs and I/O, start/restart/stop; init-job state; stack up, smoke test,
  stop; on-disk size of the bucket, the catalog database, and DuckDB's
  scratch; a log tail per service.
- **Tables** — namespaces and tables from the catalog; schema, snapshot
  summary, and location of the selected table; its rows one page at a time;
  file upload into a new or existing table; drop table / drop empty
  namespace.
- **SQL** — DuckDB against the catalog attached read-only as `lake`.
- **Ports** — the port each component binds, whether the running stack still
  matches `.env`, and an edit that writes a new value there.

## Shape

```
lib/nqlake.ts             runs nqlake.py --json in a subprocess, resolves its JSON
lib/client.ts             usePoll, getJson/postJson, uploadFile (XHR, for progress), formatBytes
lib/types.ts              the payload shapes nqlake.py returns
app/api/*/route.ts        one route per subcommand: status, stats, catalog, rows, query,
                          drop, ops, logs, ports — and upload, which streams the body to
                          images/duckdb/work and then runs `load`
app/page.tsx              Overview
app/tables/page.tsx       Tables
app/sql/page.tsx          SQL
app/ports/page.tsx        Ports
components/               sparkline + storage bars, result table, sidebar, primitives
```

- **The console holds no stack logic.** Every route is a thin wrapper around
  `nqlake(["<subcommand>", …])`, which shells out to `uv run --frozen python
  backend/nqlake.py --json`. A change in behavior belongs in the CLI, where
  both front ends get it.
- **Failures arrive as data.** `nqlake.py` reports errors as `{ok: false,
  error}` on stdout; the wrapper only synthesizes that object when the process
  dies without parseable output, so a page never has to distinguish a crash
  from a reported failure.
- **Rows are paged, not streamed.** A table can be far larger than a browser
  tab; the Tables page asks for `LIMIT n OFFSET m` (100/200/500 per page) and
  uses the current snapshot's `total-records` for the page count. Every page
  is one in-process DuckDB attach, tens of milliseconds.
- **Uploads stream to disk.** The file is the request body, written straight
  into `images/duckdb/work`, loaded from there, then deleted. Nothing is
  buffered in memory, so file size is bounded by disk.
- **Timeouts follow the work.** Status, catalog, logs, and ports get 25 s,
  stats 30 s, drop 60 s; rows and query 150 s, upload and `ops` 330 s,
  because those are bounded by the data they move, not by the call.
- **Overview polls**, status every 5 s and stats every 8 s; the other pages
  fetch on demand. Sparklines are the samples collected since the page was
  opened — not persisted, and a reload starts them over.

## Security

The console executes arbitrary SQL, drops tables, starts and stops
containers, and edits `.env`, with no authentication in front of any of it.
Keep it bound to localhost; do not expose `CONSOLE_PORT`.
