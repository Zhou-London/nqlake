"""Data-plane access for the NQ Lake tooling: Iceberg catalog browsing,
DuckDB queries, and file loading.

DuckDB runs in a throwaway compose container per call (a few seconds of
startup each). Loaded files must be visible inside it, so `load` stages host
files through the images/duckdb/work bind mount.
"""

import json
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from stack import ROOT, compose, env, http_json, lakekeeper_url

WORK_DIR = ROOT / "images" / "duckdb" / "work"

TABLE_RE = re.compile(r"^[A-Za-z_]\w*\.[A-Za-z_]\w*$")

# Extensions DuckDB can scan directly with SELECT * FROM '<file>'.
LOADABLE = (".csv", ".csv.gz", ".tsv", ".tsv.gz", ".parquet",
            ".json", ".json.gz", ".jsonl", ".ndjson")


def _catalog_base():
    """Base URL of the warehouse's REST catalog, or None if unreachable."""
    conf = env()
    lakekeeper = lakekeeper_url(conf)
    warehouse = conf["LAKEHOUSE_WAREHOUSE"]
    config = http_json(f"{lakekeeper}/catalog/v1/config?warehouse={warehouse}")
    if not config:
        return None
    return f"{lakekeeper}/catalog/v1/{config['defaults']['prefix']}"


def _namespaces(base):
    listing = http_json(f"{base}/namespaces") or {}
    return [".".join(parts) for parts in listing.get("namespaces", [])]


def table_count():
    """Live table count across all namespaces; None if the catalog is down."""
    base = _catalog_base()
    if not base:
        return None
    count = 0
    for ns in _namespaces(base):
        tables = http_json(f"{base}/namespaces/{ns}/tables") or {}
        count += len(tables.get("identifiers", []))
    return count


def table_exists(qualified):
    base = _catalog_base()
    if not base:
        return None
    ns, _, name = qualified.rpartition(".")
    return http_json(f"{base}/namespaces/{ns}/tables/{name}") is not None


def catalog(table=None):
    base = _catalog_base()
    if not base:
        return {"ok": False, "error": "catalog unreachable"}

    if table:
        ns, _, name = table.rpartition(".")
        raw = http_json(f"{base}/namespaces/{ns}/tables/{name}")
        if not raw:
            return {"ok": False, "error": f"table {table} not found"}
        meta = raw.get("metadata", {})
        schemas = {s["schema-id"]: s for s in meta.get("schemas", [])}
        schema = schemas.get(meta.get("current-schema-id"), {})
        snapshots = meta.get("snapshots", [])
        current = next(
            (s for s in snapshots
             if s["snapshot-id"] == meta.get("current-snapshot-id")),
            None,
        )
        return {
            "ok": True,
            "table": {
                "namespace": ns,
                "name": name,
                "location": meta.get("location"),
                "formatVersion": meta.get("format-version"),
                "lastUpdatedMs": meta.get("last-updated-ms"),
                "fields": [
                    {
                        "id": f["id"],
                        "name": f["name"],
                        "type": f["type"] if isinstance(f["type"], str)
                        else f["type"].get("type", "struct"),
                        "required": f["required"],
                    }
                    for f in schema.get("fields", [])
                ],
                "snapshotCount": len(snapshots),
                "currentSnapshot": current and {
                    "id": current["snapshot-id"],
                    "timestampMs": current["timestamp-ms"],
                    "summary": current.get("summary", {}),
                },
            },
        }

    namespaces = []
    for ns in _namespaces(base):
        tables = http_json(f"{base}/namespaces/{ns}/tables") or {}
        namespaces.append({
            "name": ns,
            "tables": [i["name"] for i in tables.get("identifiers", [])],
        })
    return {"ok": True, "namespaces": namespaces}


def _parse_duckdb_json(out):
    """Extracts row arrays from `duckdb -json` output.

    Multi-statement output is several JSON arrays back to back; the last one
    is the visible result.
    """
    decoder = json.JSONDecoder()
    idx, rows = 0, []
    out = out.strip()
    while idx < len(out):
        try:
            value, end = decoder.raw_decode(out, idx)
        except json.JSONDecodeError:
            break
        if isinstance(value, list):
            rows = value
        idx = end
        while idx < len(out) and out[idx] in " \n\r\t":
            idx += 1
    return rows


def _duckdb(sql, timeout):
    """Runs SQL in a fresh DuckDB client container with the catalog attached.

    Returns (ok, rows, error, elapsed_ms).
    """
    started = time.time()
    try:
        rc, out, err = compose(
            "run", "--rm", "-T", "duckdb",
            "duckdb", "-init", "/tmp/attach.sql", "-json",
            "-c", sql,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, [], f"query exceeded {timeout}s", int((time.time() - started) * 1000)
    elapsed = int((time.time() - started) * 1000)
    if rc != 0:
        # The attach banner precedes the real error on stderr.
        lines = [l for l in err.splitlines() if l and "Loading resources" not in l]
        return False, [], "\n".join(lines[-12:]), elapsed
    return True, _parse_duckdb_json(out), None, elapsed


def query(sql, limit=500, timeout=90):
    if not sql or not sql.strip():
        return {"ok": False, "error": "empty statement"}
    ok, rows, error, elapsed = _duckdb(sql, timeout)
    if not ok:
        return {"ok": False, "error": error, "elapsedMs": elapsed}
    return {
        "ok": True,
        "columns": list(rows[0].keys()) if rows else [],
        "rows": rows[:limit],
        "rowCount": len(rows),
        "truncated": len(rows) > limit,
        "elapsedMs": elapsed,
    }


def load(file, table, replace=False, timeout=300):
    """Loads a data file into an Iceberg table.

    Creates the namespace and table when absent, appends (BY NAME) when
    present, or rebuilds the table with `replace`. Files outside
    images/duckdb/work are staged through it and cleaned up afterwards.
    """
    src = Path(file).expanduser().resolve()
    if not src.is_file():
        return {"ok": False, "error": f"no such file: {src}"}
    if not src.name.lower().endswith(LOADABLE):
        return {"ok": False, "error": f"unsupported file type (expected one of {', '.join(LOADABLE)})"}
    if not TABLE_RE.match(table):
        return {"ok": False, "error": "table must be <namespace>.<name>"}
    ns, _, name = table.rpartition(".")

    exists = table_exists(table)
    if exists is None:
        return {"ok": False, "error": "catalog unreachable"}

    staged = None
    try:
        if src.is_relative_to(WORK_DIR):
            container_path = f"/work/{src.relative_to(WORK_DIR)}"
        else:
            WORK_DIR.mkdir(parents=True, exist_ok=True)
            staged = WORK_DIR / f".load-{uuid.uuid4().hex[:8]}-{src.name}"
            shutil.copyfile(src, staged)
            container_path = f"/work/{staged.name}"

        target = f'lake."{ns}"."{name}"'
        if exists and not replace:
            statement = f"INSERT INTO {target} BY NAME SELECT * FROM '{container_path}';"
            mode = "append"
        else:
            statement = (
                f'CREATE SCHEMA IF NOT EXISTS lake."{ns}"; '
                + (f"DROP TABLE IF EXISTS {target}; " if exists else "")
                + f"CREATE TABLE {target} AS SELECT * FROM '{container_path}';"
            )
            mode = "replace" if exists else "create"

        ok, _, error, elapsed = _duckdb(statement, timeout)
        if not ok:
            return {"ok": False, "error": error, "elapsedMs": elapsed}

        ok, rows, error, _ = _duckdb(f"SELECT count(*) AS n FROM {target};", timeout=90)
        total = rows[0]["n"] if ok and rows else None
        return {
            "ok": True,
            "table": table,
            "mode": mode,
            "file": str(src),
            "tableRows": total,
            "elapsedMs": elapsed,
        }
    finally:
        if staged is not None:
            staged.unlink(missing_ok=True)
