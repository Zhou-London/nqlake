# nqlake-console

Web console for the NQ Lake stack. Next.js on the host; every page reads the
stack through `scripts/console/nqlake.py`, so the console and the CLI report
the same numbers and run the same operations.

```bash
npm install
npm run dev     # http://localhost:3000, equivalently `make console` one level up
npm run build && npm run start   # production build, `make console-build`
```

Needs Node and a Docker daemon that can see the compose project — nothing
else. The stack itself does not have to be up: an absent component is
rendered as absent rather than as an error.

## Shape

```
lib/nqlake.ts             runs nqlake.py --json in a subprocess, resolves its JSON
lib/client.ts             usePoll (polling fetch hook), postJson, byte/time formatters
lib/types.ts              the payload shapes nqlake.py returns
app/api/*/route.ts        one route per subcommand: status, stats, catalog, query, ops, logs
app/page.tsx              Overview: component health, coordination links, sparklines
app/catalog/page.tsx      Catalog: namespaces, table schema and snapshots, row preview
app/sql/page.tsx          SQL: DuckDB against the catalog attached as `lake`
app/ops/page.tsx          Operations: service control, stack up, smoke test, logs
components/               charts (sparkline, storage bars, API activity), table, sidebar, primitives
```

- **The console holds no stack logic.** Every route is a thin wrapper around
  `nqlake(["<subcommand>", …])`, which shells out to `python3
  scripts/console/nqlake.py --json`. A change in behavior belongs in the CLI,
  where both front ends get it.
- **Failures arrive as data.** `nqlake.py` reports errors as `{ok: false,
  error}` on stdout; the wrapper only synthesizes that object when the process
  dies without parseable output, so a page never has to distinguish a crash
  from a reported failure.
- **Timeouts follow the work, not the request.** Status, catalog, and logs get
  25 s, stats 30 s; a query gets 150 s and `ops` 330 s, because both start a
  throwaway DuckDB or init container and pay its cold start before any work
  begins.
- **Overview polls**, status every 5 s and stats every 8 s; the other pages
  fetch on demand. Sparklines are the samples the page has collected since it
  was opened — they are not persisted, and reloading starts them over.

## Security

The console executes arbitrary SQL and starts, stops, and restarts containers,
with no authentication in front of either. Keep it bound to localhost; do not
expose port 3000.
