#!/usr/bin/env python3
"""NQ Lake command-line tool and console backend.

Subcommands live in stack.py (status/stats/ops/logs), data.py
(catalog/rows/query/load/drop), and ports.py (ports); this file parses
arguments and renders results. Output is a human-readable table on a TTY and
one JSON object otherwise (the console's API routes pass --json explicitly).
Failures are reported as "ok": false in JSON mode and a nonzero exit in
pretty mode.
"""

import argparse
import json
import sys
from datetime import datetime

import data
import ports
import stack


# --- pretty renderers ------------------------------------------------------


def _table(headers, rows):
    """Renders rows as an aligned text table; values are stringified."""
    cells = [[("" if v is None else str(v)) for v in row] for row in rows]
    widths = [max(len(h), *(len(r[i]) for r in cells)) if cells else len(h)
              for i, h in enumerate(headers)]
    lines = [headers, ["-" * w for w in widths], *cells]
    return "\n".join("  ".join(c.ljust(w) for c, w in zip(row, widths)) for row in lines)


def _bytes(n):
    for unit, size in (("GiB", 1 << 30), ("MiB", 1 << 20), ("KiB", 1 << 10)):
        if n >= size:
            return f"{n / size:.1f} {unit}"
    return f"{n} B"


def _render_status(result):
    rows = [
        (svc, c["state"], c["health"] or ("-" if c["oneshot"] else "?"), c["status"] or "")
        for svc, c in result["components"].items()
    ]
    print(_table(("SERVICE", "STATE", "HEALTH", "STATUS"), rows))
    cat, wh = result["catalog"], result["warehouse"] or {}
    print(f"\ncatalog: {'reachable' if cat['reachable'] else 'UNREACHABLE'} "
          f"(lakekeeper {cat['version'] or '?'}) · "
          f"metadata db {'ok' if cat['dbOk'] else 'BROKEN'} · "
          f"warehouse {wh.get('name', '?')} ({wh.get('status', 'absent')})")


def _render_stats(result):
    rows = [
        (svc, f"{c['cpuPercent']:.1f}%", _bytes(c["memBytes"]), c["pids"], c["netIO"], c["blockIO"])
        for svc, c in result["containers"].items()
    ]
    print(_table(("SERVICE", "CPU", "MEM", "PIDS", "NET I/O", "BLOCK I/O"), rows))
    s = result["storage"]
    print(f"\non disk: bucket {_bytes(s['bucket'])} · postgres {_bytes(s['postgres'])} · "
          f"duckdb scratch {_bytes(s['duckdb'])}")


def _render_catalog(result):
    if "table" in result:
        t = result["table"]
        print(f"{t['namespace']}.{t['name']}  (format v{t['formatVersion']}, "
              f"{t['snapshotCount']} snapshots)")
        print(f"location: {t['location']}")
        print(f"updated:  {datetime.fromtimestamp(t['lastUpdatedMs'] / 1000):%Y-%m-%d %H:%M:%S}")
        summary = (t.get("currentSnapshot") or {}).get("summary", {})
        if summary.get("total-records"):
            print(f"records:  {summary['total-records']} "
                  f"in {summary.get('total-data-files', '?')} data files")
        print()
        print(_table(("#", "COLUMN", "TYPE", "REQUIRED"),
                     [(f["id"], f["name"], f["type"], "yes" if f["required"] else "no")
                      for f in t["fields"]]))
        return
    for ns in result["namespaces"]:
        print(ns["name"])
        for t in ns["tables"] or ["(no tables)"]:
            print(f"  {t}")


def _render_rows(result):
    rows, columns = result.get("rows") or [], result.get("columns") or []
    if rows:
        print(_table(columns, [[r.get(c) for c in columns] for r in rows]))
    note = " (truncated)" if result.get("truncated") else ""
    offset = f" from offset {result['offset']}" if "offset" in result else ""
    print(f"\n{result.get('rowCount', 0)} rows{note}{offset} · {result.get('elapsedMs', 0)} ms")


def _render_load(result):
    print(f"{result['mode']} {result['table']} from {result['file']}")
    for w in result.get("widened", []):
        print(f"  {w['column']}: {w['from']} stored as {w['to']} (no such Iceberg type)")
    print(f"table now has {result['tableRows']} rows · {result['elapsedMs']} ms")


def _render_ops(result):
    what = " ".join(p for p in (result["action"], result.get("service")) if p)
    print(f"{what}: done in {result['elapsedMs']} ms")
    if result.get("detail"):
        print(result["detail"])


# What has to be restarted before a changed port takes effect.
RESTART_HINT = {
    "stack": "`make up` recreates the containers on the new ports",
    "console": "restart `make console` to move the console itself",
}


def _render_ports(result):
    rows = [
        (p["key"], p["service"], "?" if p["value"] is None else p["value"],
         "restart" if p["pending"] else "live" if p["running"] else "-", p["label"])
        for p in result["ports"]
    ]
    print(_table(("VARIABLE", "SERVICE", "PORT", "STATE", "WHAT"), rows))
    for entry in result["ports"]:
        if entry.get("error"):
            print(f"\n{entry['error']}")
    for change in result.get("changed") or []:
        print(f"{change['key']}: {change['from'] or 'unset'} -> {change['to']}")
    restart = result.get("restart") or sorted({p["applies"] for p in result["ports"] if p["pending"]})
    for target in restart:
        print(RESTART_HINT[target])


RENDERERS = {
    "status": _render_status,
    "stats": _render_stats,
    "catalog": _render_catalog,
    "rows": _render_rows,
    "query": _render_rows,
    "load": _render_load,
    "drop": lambda r: print(f"dropped {r['dropped']}"),
    "ops": _render_ops,
    "logs": lambda r: print("\n".join(r.get("lines") or [])),
    "ports": _render_ports,
}


def _port_updates(pairs):
    """Parses `KEY=PORT` arguments into a mapping.

    Raises:
        ValueError: An argument is not of the form KEY=PORT.
    """
    updates = {}
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not sep or not key.strip():
            raise ValueError(f"--set expects KEY=PORT, got {pair!r}")
        updates[key.strip()] = value.strip()
    return updates


# --- entrypoint ------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(prog="nqlake", description="NQ Lake stack tool")
    fmt = parser.add_mutually_exclusive_group()
    fmt.add_argument("--json", action="store_true", help="force JSON output")
    fmt.add_argument("--pretty", action="store_true", help="force table output")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="component health, catalog and warehouse state")
    sub.add_parser("stats", help="container CPU/memory/IO and on-disk sizes")

    p = sub.add_parser("catalog", help="list namespaces/tables or inspect one")
    p.add_argument("--table", help="qualified name, e.g. market.trades")

    p = sub.add_parser("rows", help="one page of a table's rows")
    p.add_argument("--table", required=True)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--limit", type=int, default=200)
    p.add_argument("--timeout", type=int, default=90)

    p = sub.add_parser("query", help="run SQL via DuckDB (catalog attached as `lake`)")
    p.add_argument("--sql", required=True)
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--timeout", type=int, default=90)

    p = sub.add_parser("load", help="load a CSV/Parquet/JSON file into a table")
    p.add_argument("--file", required=True)
    p.add_argument("--table", required=True, help="<namespace>.<name>; created if absent")
    p.add_argument("--replace", action="store_true", help="rebuild the table instead of appending")
    p.add_argument("--timeout", type=int, default=300)

    p = sub.add_parser("drop", help="drop a table (purging its data) or an empty namespace")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--table")
    g.add_argument("--namespace")

    p = sub.add_parser("ops", help="administrative actions")
    p.add_argument("--action", required=True,
                   choices=["start", "stop", "restart", "stack-up", "stack-stop", "smoke"])
    p.add_argument("--service", choices=list(stack.SERVICES))

    p = sub.add_parser("ports", help="show or change the ports the stack binds")
    p.add_argument("--set", action="append", default=[], metavar="KEY=PORT",
                   help="assign a port, e.g. --set MINIO_API_PORT=9100 (repeatable)")

    p = sub.add_parser("logs", help="tail a service's logs")
    p.add_argument("--service", required=True)
    p.add_argument("--tail", type=int, default=200)

    args = parser.parse_args()

    calls = {
        "status": lambda: stack.status(),
        "stats": lambda: stack.stats(),
        "ops": lambda: data.smoke() if args.action == "smoke" else stack.ops(args.action, args.service),
        "logs": lambda: stack.logs(args.service, args.tail),
        "ports": lambda: ports.apply(_port_updates(args.set)) if args.set else ports.listing(),
        "catalog": lambda: data.catalog(args.table),
        "rows": lambda: data.rows(args.table, args.offset, args.limit, args.timeout),
        "query": lambda: data.query(args.sql, args.limit, args.timeout),
        "load": lambda: data.load(args.file, args.table, args.replace, args.timeout),
        "drop": lambda: data.drop(args.table, args.namespace),
    }
    try:
        result = calls[args.command]()
    except Exception as exc:  # noqa: BLE001 - the console needs JSON, not tracebacks
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    if args.json or not (args.pretty or sys.stdout.isatty()):
        json.dump(result, sys.stdout)
        print()
        return
    if not result.get("ok"):
        print(f"error: {result.get('error', 'unknown failure')}", file=sys.stderr)
        sys.exit(1)
    RENDERERS[args.command](result)


if __name__ == "__main__":
    main()
