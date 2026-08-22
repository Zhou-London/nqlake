# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`nqlake` — a self-contained Iceberg lakehouse: MinIO for objects, Lakekeeper on
Postgres as the REST catalog, DuckDB as the query engine, plus a CLI and a
Next.js console over the top. One compose project. See [README.md](README.md).

## Layout

```
compose.yaml        the whole stack; one-shot init jobs + `client`/`test` profiles
.env.example        credential/name template; copy to .env (gitignored)
Makefile            the command surface (up/down/sql/smoke/status/load/ports/console)
scripts/            minio-init.sh, lakekeeper-init.sh, smoke-test.sh,
                    duckdb-entrypoint.sh (renders the attach SQL per client)
scripts/console/    nqlake.py (CLI + console backend), stack.py, data.py,
                    ports.py (the .env port registry)
sql/                attach.sql.template — the catalog attached as `lake`
ui/                 the console (Next.js); its API routes shell out to nqlake.py
                    (ui/README.md documents its shape)
images/             bind-mounted service data, gitignored
```

Image definitions are **not** here — they live in the parent repository under
`Dockerfiles/lakehouse-*`, and `compose.yaml` builds them by relative path. A
change to what is installed in a service belongs there, not in this repo.

## Working on the stack

`make up` is the verification. It builds, starts the stores, and re-runs both
init jobs; `make smoke` then writes and reads an Iceberg table end to end. A
compose change nobody brought up is unverified.

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

`scripts/console/ports.py` owns that file — the registry of variables, the
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

## The attach template

No DuckDB client carries the catalog address or the warehouse name.
`scripts/duckdb-entrypoint.sh` renders `sql/attach.sql.template` into
`/tmp/attach.sql` at container start, filling both from the environment, and
every client — `make sql`, the smoke test, `nqlake.py query` — loads that file
with `duckdb -init`. Keep it that way: a literal in the SQL goes stale the
moment a port or the warehouse name changes, and it fails at query time rather
than at startup.

## Console and CLI

`scripts/console/nqlake.py` is one backend with two front ends: it prints
tables on a TTY and JSON when piped, and the Next.js API routes shell out to it
with `--json`. New functionality goes into the CLI first — a route that talks
to a service directly instead of through `nqlake.py` puts the console and the
command line out of step.

The console executes admin operations and arbitrary SQL against the stack, and
the catalog runs without auth. It is a localhost tool; do not expose it.

## Commits

One change per commit, imperative subject, body explaining why. Never commit
`.env`, `images/`, or `ui/node_modules`.
