#!/usr/bin/env python3
"""NQ Lake command-line tool and console backend.

Subcommands live in stack.py (status/stats/ops/logs), data.py
(catalog/query/load), and ports.py (ports); this file parses arguments and
renders results. Output
is a human-readable table on a TTY and one JSON object otherwise (the
console's API routes pass --json explicitly). Failures are reported as
"ok": false in JSON mode and a nonzero exit in pretty mode.
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
    widths = [
        max(len(h), *(len(r[i]) for r in cells)) if cells else len(h)
        for i, h in enumerate(headers)
    ]
    line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))
    out = [line, "  ".join("-" * w for w in widths)]
    out += ["  ".join(c.ljust(w) for c, w in zip(row, widths)) for row in cells]
    return "\n".join(out)


def _fmt_bytes(n):
    for unit, size in (("GiB", 1 << 30), ("MiB", 1 << 20), ("KiB", 1 << 10)):
        if n >= size:
            return f"{n / size:.1f} {unit}"
    return f"{n} B"


def _render_status(result):
    rows = [
        (
            svc,
            c["state"],
            c.get("health") or ("-" if c["oneshot"] else "?"),
            "yes" if c.get("api") else ("-" if "api" not in c else "NO"),
            c.get("status") or "",
        )
        for svc, c in result["components"].items()
    ]
    print(_table(("SERVICE", "STATE", "HEALTH", "API", "STATUS"), rows))
    print()
    links = result["links"]
    for key, label in (
        ("lakekeeper-postgres", "lakekeeper -> postgres"),
        ("lakekeeper-minio", "lakekeeper -> minio"),
        ("duckdb-stack", "duckdb -> lakehouse"),
    ):
        mark = "ok" if links[key]["ok"] else "BROKEN"
        print(f"link {label:24s} {mark}")
    server = result.get("server") or {}
    warehouse = result.get("warehouse") or {}
    print(f"\nlakekeeper {server.get('version', '?')} · "
          f"warehouse {warehouse.get('name', '?')} ({warehouse.get('status', '?')})")


def _render_stats(result):
    rows = [
        (svc, f"{c['cpuPercent']:.1f}%", _fmt_bytes(c["memBytes"]), c["pids"], c["netIO"])
        for svc, c in result["containers"].items()
    ]
    print(_table(("SERVICE", "CPU", "MEM", "PIDS", "NET I/O"), rows))
    s = result["storage"]
    print(f"\nbucket s3://{s['bucket']['name']}: {_fmt_bytes(s['bucket']['bytes'])}, "
          f"{s['bucket']['files']} objects, {s['bucket']['parquetFiles']} parquet "
          f"({_fmt_bytes(s['bucket']['parquetBytes'])})")
    print(f"postgres: {_fmt_bytes(s['postgres']['bytes'])} · "
          f"tables in catalog: {result['tableCount']}")
    calls = sum(x["calls"] for x in result["apiSeries"])
    errors = sum(x["errors"] for x in result["apiSeries"])
    print(f"catalog API: {calls} calls, {errors} errors")


def _render_catalog(result):
    if "table" in result:
        t = result["table"]
        print(f"{t['namespace']}.{t['name']}  (format v{t['formatVersion']}, "
              f"{t['snapshotCount']} snapshots)")
        print(f"location: {t['location']}")
        updated = datetime.fromtimestamp(t["lastUpdatedMs"] / 1000)
        print(f"updated:  {updated:%Y-%m-%d %H:%M:%S}")
        summary = (t.get("currentSnapshot") or {}).get("summary", {})
        if summary.get("total-records"):
            print(f"records:  {summary['total-records']} "
                  f"in {summary.get('total-data-files', '?')} data files")
        print()
        print(_table(
            ("#", "COLUMN", "TYPE", "REQUIRED"),
            [(f["id"], f["name"], f["type"], "yes" if f["required"] else "no")
             for f in t["fields"]],
        ))
        return
    for ns in result["namespaces"]:
        print(ns["name"])
        for t in ns["tables"]:
            print(f"  {t}")
        if not ns["tables"]:
            print("  (no tables)")


def _render_query(result):
    rows = result.get("rows") or []
    columns = result.get("columns") or []
    if rows:
        print(_table(columns, [[r.get(c) for c in columns] for r in rows]))
    note = " (truncated)" if result.get("truncated") else ""
    print(f"\n{result.get('rowCount', 0)} rows{note} · {result.get('elapsedMs', 0)} ms")


def _render_load(result):
    print(f"{result['mode']} {result['table']} from {result['file']}")
    print(f"table now has {result['tableRows']} rows · {result['elapsedMs']} ms")


def _render_ops(result):
    if result.get("action") == "smoke":
        r = result["result"]
        print(f"smoke test {'PASSED' if r['ok'] else 'FAILED'} in {r['elapsedMs']} ms")
        print(r["detail"])
    else:
        parts = [result.get("action"), result.get("service")]
        print(" ".join(p for p in parts if p) + ": done")


def _render_logs(result):
    print("\n".join(result.get("lines") or []))


# What has to be restarted before a changed port takes effect.
RESTART_HINT = {
    "stack": "`make up` recreates the containers on the new ports",
    "console": "restart `make console` to move the console itself",
}


def _render_ports(result):
    rows = [
        (
            p["key"],
            p["service"],
            "?" if p["value"] is None else p["value"],
            "restart" if p["pending"] else "live" if p["running"] else "-",
            p["label"],
        )
        for p in result["ports"]
    ]
    print(_table(("VARIABLE", "SERVICE", "PORT", "STATE", "WHAT"), rows))
    for entry in result["ports"]:
        if entry.get("error"):
            print(f"\n{entry['error']}")
    changed = result.get("changed") or []
    if changed:
        print()
        for change in changed:
            print(f"{change['key']}: {change['from'] or 'unset'} -> {change['to']}")
    restart = result.get("restart") or sorted(
        {p["applies"] for p in result["ports"] if p["pending"]}
    )
    for target in restart:
        print(RESTART_HINT[target])


RENDERERS = {
    "status": _render_status,
    "stats": _render_stats,
    "catalog": _render_catalog,
    "query": _render_query,
    "load": _render_load,
    "ops": _render_ops,
    "logs": _render_logs,
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
    parser = argparse.ArgumentParser(
        prog="nqlake", description="NQ Lake stack tool"
    )
    fmt = parser.add_mutually_exclusive_group()
    fmt.add_argument("--json", action="store_true", help="force JSON output")
    fmt.add_argument("--pretty", action="store_true", help="force table output")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="component and coordination health")
    sub.add_parser("stats", help="container, storage, and API usage figures")

    p = sub.add_parser("catalog", help="list namespaces/tables or inspect one")
    p.add_argument("--table", help="qualified name, e.g. market.trades")

    p = sub.add_parser("query", help="run SQL via DuckDB (catalog attached as `lake`)")
    p.add_argument("--sql", required=True)
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--timeout", type=int, default=90)

    p = sub.add_parser("load", help="load a CSV/Parquet/JSON file into a table")
    p.add_argument("--file", required=True)
    p.add_argument("--table", required=True, help="<namespace>.<name>; created if absent")
    p.add_argument("--replace", action="store_true",
                   help="rebuild the table instead of appending")
    p.add_argument("--timeout", type=int, default=300)

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
        "ops": lambda: stack.ops(args.action, args.service),
        "logs": lambda: stack.logs(args.service, args.tail),
        "ports": lambda: (
            ports.apply(_port_updates(args.set)) if args.set else ports.listing()
        ),
        "catalog": lambda: data.catalog(args.table),
        "query": lambda: data.query(args.sql, args.limit, args.timeout),
        "load": lambda: data.load(args.file, args.table, args.replace, args.timeout),
    }
    try:
        result = calls[args.command]()
    except Exception as exc:  # noqa: BLE001 - the console needs JSON, not tracebacks
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    pretty = args.pretty or (sys.stdout.isatty() and not args.json)
    if not pretty:
        json.dump(result, sys.stdout)
        print()
        return
    if not result.get("ok"):
        print(f"error: {result.get('error', 'unknown failure')}", file=sys.stderr)
        sys.exit(1)
    RENDERERS[args.command](result)


if __name__ == "__main__":
    main()
