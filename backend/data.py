"""Data-plane access for the NQ Lake tooling: catalog browsing, table rows,
SQL, file loading, and drops.

Two engines, one rule: DuckDB computes, PyIceberg manages. Reading a table,
running SQL, and turning a file into rows is DuckDB, attached to the catalog
read-only. Creating and dropping tables and namespaces, committing rows, and
inspecting metadata is PyIceberg through the REST catalog. `load` is where
they meet: DuckDB reads the file and casts what Iceberg lacks, PyIceberg
commits the batches it produces.

Every call opens its own connections and closes them. A table can be larger
than memory, which is why `rows` pages with LIMIT/OFFSET and `load` streams
in batches.
"""

import contextlib
import datetime
import decimal
import glob
import math
import re
import socket
import threading
import time
import uuid
from pathlib import Path

import duckdb
import pyarrow as pa
from pyiceberg.catalog.rest import RestCatalog
from pyiceberg.types import PrimitiveType

from stack import ROOT, env, lakekeeper_url

EXTENSION_DIR = ROOT / "images" / "duckdb" / "extensions"

# Rows per batch DuckDB hands PyIceberg during `load`. Each batch becomes one
# data file and one snapshot, so this is also the file size knob.
LOAD_BATCH_ROWS = 1_000_000

TABLE_RE = re.compile(r"^[A-Za-z_]\w*\.[A-Za-z_]\w*$")
NAMESPACE_RE = re.compile(r"^[A-Za-z_]\w*$")

# Extensions DuckDB can scan directly with SELECT * FROM '<file>'.
LOADABLE = (".csv", ".csv.gz", ".tsv", ".tsv.gz", ".parquet",
            ".json", ".json.gz", ".jsonl", ".ndjson")

# DuckDB types the Iceberg extension refuses to create a column with, and
# the narrowest type it accepts that holds every value of the original.
# Iceberg has no 8/16-bit or unsigned integers and its v2 timestamps are
# microseconds, so pandas' uint8 flags and datetime64[ns] columns both land
# here. The keys are replaced as whole words inside nested types too, so
# STRUCT(n UTINYINT)[] becomes STRUCT(n INTEGER)[].
ICEBERG_WIDENING = {
    "TINYINT": "INTEGER",
    "SMALLINT": "INTEGER",
    "UTINYINT": "INTEGER",
    "USMALLINT": "INTEGER",
    "UINTEGER": "BIGINT",
    "UBIGINT": "DECIMAL(20,0)",
    "TIMESTAMP_S": "TIMESTAMP",
    "TIMESTAMP_MS": "TIMESTAMP",
    "TIMESTAMP_NS": "TIMESTAMP",
    "JSON": "VARCHAR",
}
_WIDENING_RE = re.compile(r"\b(" + "|".join(ICEBERG_WIDENING) + r")\b", re.IGNORECASE)



# --- PyIceberg: the catalog ------------------------------------------------


def catalog_client(conf=None):
    """A REST catalog client for this stack's warehouse.

    Asks for vended credentials, so every table access gets short-lived MinIO
    keys from Lakekeeper and no S3 secret lives on this side.
    """
    conf = conf or env()
    return RestCatalog(
        "lake",
        uri=f"{lakekeeper_url(conf)}/catalog",
        warehouse=conf["LAKEHOUSE_WAREHOUSE"],
        **{"header.X-Iceberg-Access-Delegation": "vended-credentials"},
    )


def _manage(fn):
    """Runs a catalog operation; returns its dict, or {ok: False} with the
    error as text. A refused connection is reported as the catalog being
    down rather than as a requests stack trace."""
    try:
        return fn()
    except OSError as exc:
        text = str(exc)
        if "Max retries" in text or "Connection refused" in text:
            return {"ok": False, "error": "catalog unreachable"}
        return {"ok": False, "error": text}
    except Exception as exc:  # noqa: BLE001 - reported as data, not a traceback
        return {"ok": False, "error": str(exc)}


def _type_name(field_type):
    """Primitives by name (`int`, `decimal(20, 0)`), nested types by kind."""
    if isinstance(field_type, PrimitiveType):
        return str(field_type)
    return type(field_type).__name__.removesuffix("Type").lower()


def _table_detail(cat, ns, name):
    tbl = cat.load_table((ns, name))
    meta = tbl.metadata
    current = tbl.current_snapshot()
    return {
        "namespace": ns,
        "name": name,
        "location": meta.location,
        "formatVersion": meta.format_version,
        "lastUpdatedMs": meta.last_updated_ms,
        "fields": [
            {"id": f.field_id, "name": f.name, "type": _type_name(f.field_type), "required": f.required}
            for f in tbl.schema().fields
        ],
        "snapshotCount": len(meta.snapshots),
        "currentSnapshot": current and {
            "id": current.snapshot_id,
            "timestampMs": current.timestamp_ms,
            "summary": {"operation": current.summary.operation.value,
                        **current.summary.additional_properties},
        },
    }


def catalog(table=None):
    """Namespaces with their tables, or the schema and current snapshot of one table."""
    if table and not TABLE_RE.match(table):
        return {"ok": False, "error": "table must be <namespace>.<name>"}

    def run():
        cat = catalog_client()
        if table:
            ns, _, name = table.rpartition(".")
            if not cat.table_exists((ns, name)):
                return {"ok": False, "error": f"table {table} not found"}
            return {"ok": True, "table": _table_detail(cat, ns, name)}
        namespaces = []
        for parts in cat.list_namespaces():
            ns = ".".join(parts)
            namespaces.append({"name": ns, "tables": [ident[-1] for ident in cat.list_tables(ns)]})
        return {"ok": True, "namespaces": namespaces}

    return _manage(run)


def drop(table=None, namespace=None):
    """Drops a table (data purged) or an empty namespace through the catalog."""
    if table:
        if not TABLE_RE.match(table):
            return {"ok": False, "error": "table must be <namespace>.<name>"}
        ns, _, name = table.rpartition(".")
        action = lambda cat: cat.purge_table((ns, name))  # noqa: E731
    elif namespace:
        if not NAMESPACE_RE.match(namespace):
            return {"ok": False, "error": "namespace must be a bare identifier"}
        action = lambda cat: cat.drop_namespace(namespace)  # noqa: E731
    else:
        return {"ok": False, "error": "nothing to drop"}

    def run():
        action(catalog_client())
        return {"ok": True, "dropped": table or namespace}

    return _manage(run)


# --- DuckDB: the compute engine --------------------------------------------


def attach_sql(conf=None):
    """Attaches this stack's catalog as `lake`, read-only. The warehouse name
    and the catalog port come from .env, so no address is written down twice.

    READ_ONLY is the division of labor: DuckDB computes, PyIceberg manages.
    The catalog runs without auth; Lakekeeper vends short-lived MinIO
    credentials per table, so no S3 secret is needed here.
    """
    conf = conf or env()
    return (
        f"ATTACH '{conf['LAKEHOUSE_WAREHOUSE']}' AS lake ("
        f"TYPE iceberg, ENDPOINT '{lakekeeper_url(conf)}/catalog', "
        f"AUTHORIZATION_TYPE 'none', READ_ONLY);"
    )


def connect(attach=True):
    """A fresh in-memory DuckDB connection, with the catalog attached
    read-only unless `attach` is False (reading a local file needs no catalog).

    The httpfs and iceberg extensions are installed into
    images/duckdb/extensions the first time (the one step that needs
    extensions.duckdb.org) and loaded from there afterwards. The host's HTTP
    proxy, if any, is switched off after that: everything DuckDB talks to
    from here on is this stack (the catalog on localhost, MinIO at the
    address the catalog vends), and a proxy would swallow those requests.
    """
    EXTENSION_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"SET extension_directory = '{EXTENSION_DIR}'")
    if attach:
        con.execute("INSTALL httpfs; INSTALL iceberg; LOAD httpfs; LOAD iceberg;")
        con.execute("SET http_proxy = ''")
        con.execute(attach_sql())
    return con


@contextlib.contextmanager
def _session(timeout, attach=True):
    """A connection that is interrupted after `timeout` seconds and closed
    on exit. An interrupted statement raises duckdb.InterruptException."""
    con = connect(attach)
    timer = threading.Timer(timeout, con.interrupt)
    timer.start()
    try:
        yield con
    finally:
        timer.cancel()
        con.close()


def _jsonable(value):
    """Converts a DuckDB value into something json.dump accepts, matching
    what the duckdb CLI's -json mode prints: temporal values as text,
    decimals as numbers, non-finite floats as text."""
    if isinstance(value, decimal.Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time, datetime.timedelta, uuid.UUID)):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return value.hex()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _fetch(cursor):
    """All rows of the last statement's result as dicts (none for DDL)."""
    if not cursor.description:
        return []
    columns = [d[0] for d in cursor.description]
    return [dict(zip(columns, map(_jsonable, row))) for row in cursor.fetchall()]


def _unresolvable_host(message):
    """The host of an http(s) URL in a DuckDB error that does not resolve to
    this machine, or None. The stack publishes its ports on loopback only and
    the catalog vends MinIO at its compose-network name, so a name that fails
    to resolve, or that a search domain or a hijacking resolver sends
    elsewhere, means /etc/hosts is missing the mapping."""
    for host in set(re.findall(r"https?://([A-Za-z0-9._-]+)(?::\d+)?/", message)):
        try:
            addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
        except socket.gaierror:
            return host
        if not any(a == "::1" or a.startswith("127.") for a in addresses):
            return host
    return None


def _failure(exc, timeout, started):
    elapsed = int((time.time() - started) * 1000)
    if isinstance(exc, duckdb.InterruptException):
        return {"ok": False, "error": f"query exceeded {timeout}s", "elapsedMs": elapsed}
    error = str(exc)
    host = _unresolvable_host(error)
    if host:
        error += (f"\n\nThis machine does not resolve '{host}' to itself. The catalog vends MinIO at "
                  f"its compose-network name; map it to the published port with\n"
                  f"    echo '127.0.0.1 {host}' | sudo tee -a /etc/hosts")
    return {"ok": False, "error": error, "elapsedMs": elapsed}


def _result(sql, limit, timeout, **extra):
    """Runs SQL and returns the last statement's rows, capped at `limit`
    (the count is exact)."""
    started = time.time()
    try:
        with _session(timeout) as con:
            rows = _fetch(con.execute(sql))
    except Exception as exc:  # noqa: BLE001 - reported as data, not a traceback
        return _failure(exc, timeout, started)
    return {
        "ok": True,
        "columns": list(rows[0].keys()) if rows else [],
        "rows": rows[:limit],
        "rowCount": len(rows),
        "truncated": len(rows) > limit,
        "elapsedMs": int((time.time() - started) * 1000),
        **extra,
    }


def query(sql, limit=500, timeout=90):
    """Runs SQL as written; at most `limit` rows come back, the count is exact.
    The catalog is attached read-only: a write to `lake` is refused."""
    if not sql or not sql.strip():
        return {"ok": False, "error": "empty statement"}
    return _result(sql, limit, timeout)


def rows(table, offset=0, limit=200, timeout=90):
    """One page of a table, in storage order. Pair with the snapshot's
    total-records (see catalog) to page through the whole table."""
    if not TABLE_RE.match(table):
        return {"ok": False, "error": "table must be <namespace>.<name>"}
    ns, _, name = table.rpartition(".")
    sql = f'SELECT * FROM lake."{ns}"."{name}" LIMIT {int(limit)} OFFSET {int(offset)};'
    return _result(sql, limit, timeout, offset=offset)


# --- load: DuckDB reads, PyIceberg commits ---------------------------------


def _iceberg_type(duckdb_type):
    """The type a column must be cast to before Iceberg accepts it (unchanged
    when it already is one)."""
    return _WIDENING_RE.sub(lambda m: ICEBERG_WIDENING[m.group(1).upper()], duckdb_type)


def _widened_projection(con, source):
    """A SELECT over the file `source` whose columns are all valid Iceberg
    types, and the list of columns it had to cast as {column, from, to}."""
    columns = _fetch(con.execute(f"DESCRIBE SELECT * FROM '{source}';"))
    widened, replacements = [], []
    for col in columns:
        name, from_type = col["column_name"], col["column_type"]
        to_type = _iceberg_type(from_type)
        if to_type == from_type:
            continue
        quoted = '"' + name.replace('"', '""') + '"'
        replacements.append(f"CAST({quoted} AS {to_type}) AS {quoted}")
        widened.append({"column": name, "from": from_type, "to": to_type})
    select = f"SELECT * FROM '{source}'"
    if replacements:
        select = f"SELECT * REPLACE ({', '.join(replacements)}) FROM '{source}'"
    return select, widened


def _total_records(cat, ident):
    current = cat.load_table(ident).current_snapshot()
    return int(current.summary.additional_properties.get("total-records", 0)) if current else 0


def load(file, table, replace=False, timeout=300):
    """Loads a data file, or every file matching a glob, into an Iceberg table.

    Creates the namespace and table when absent, appends when present, or
    drops and recreates the table with `replace`. DuckDB reads the files in
    place (so they may live anywhere on the host), casts columns whose type
    Iceberg lacks (see ICEBERG_WIDENING; the result reports them under
    `widened`), and streams Arrow batches of LOAD_BATCH_ROWS; PyIceberg
    creates the table from the first batch's schema and commits the rest.
    """
    src = Path(file).expanduser()
    if any(ch in str(src) for ch in "*?["):
        matches = sorted(glob.glob(str(src)))
        if not matches:
            return {"ok": False, "error": f"no files match {src}"}
    else:
        src = src.resolve()
        if not src.is_file():
            return {"ok": False, "error": f"no such file: {src}"}
        matches = [str(src)]
    if not all(m.lower().endswith(LOADABLE) for m in matches):
        return {"ok": False, "error": f"unsupported file type (expected one of {', '.join(LOADABLE)})"}
    if not TABLE_RE.match(table):
        return {"ok": False, "error": "table must be <namespace>.<name>"}
    ns, _, name = table.rpartition(".")
    ident = (ns, name)
    source = str(src).replace("'", "''")

    started = time.time()
    try:
        cat = catalog_client()
        exists = cat.table_exists(ident)
        with _session(timeout, attach=False) as con:
            select, widened = _widened_projection(con, source)
            reader = con.execute(select).fetch_record_batch(LOAD_BATCH_ROWS)
            if exists and not replace:
                tbl = cat.load_table(ident)
                mode = "append"
            else:
                cat.create_namespace_if_not_exists(ns)
                if exists:
                    cat.purge_table(ident)
                tbl = cat.create_table(ident, schema=reader.schema)
                mode = "replace" if exists else "create"
            tbl.append(reader)
        total = _total_records(cat, ident)
    except Exception as exc:  # noqa: BLE001
        return _failure(exc, timeout, started)
    return {
        "ok": True,
        "table": table,
        "mode": mode,
        "file": str(src),
        "tableRows": total,
        "widened": widened,
        "elapsedMs": int((time.time() - started) * 1000),
    }


# --- smoke test ------------------------------------------------------------

SMOKE_ROWS = pa.table({
    "ts": pa.array([datetime.datetime(2026, 8, 15, 10, 0, s) for s in range(3)], pa.timestamp("us")),
    "sym": ["AAPL", "AAPL", "MSFT"],
    "px": [231.50, 231.55, 511.10],
    "qty": pa.array([100, 50, 200], pa.int64()),
})
SMOKE_EXPECTED = {"n": 3, "notional": 136947.5}


def smoke(timeout=180):
    """End-to-end check of both engines: PyIceberg creates a table through
    the catalog and commits rows (Parquet lands in MinIO via vended
    credentials), DuckDB reads them back through its read-only attach, and
    the table is purged. The `smoke` namespace stays behind."""
    ident = ("smoke", "trades")
    started = time.time()
    try:
        cat = catalog_client()
        cat.create_namespace_if_not_exists(ident[0])
        if cat.table_exists(ident):
            cat.purge_table(ident)
        cat.create_table(ident, schema=SMOKE_ROWS.schema).append(SMOKE_ROWS)
        with _session(timeout) as con:
            got = _fetch(con.execute(
                "SELECT count(*) AS n, round(sum(px * qty), 2) AS notional FROM lake.smoke.trades"))
        got = got[0] if got else {}
        if got != SMOKE_EXPECTED:
            raise RuntimeError(f"smoke-test: FAILED, got {got}, expected {SMOKE_EXPECTED}")
        cat.purge_table(ident)
    except Exception as exc:  # noqa: BLE001
        return {**_failure(exc, timeout, started), "action": "smoke"}
    return {
        "ok": True,
        "action": "smoke",
        "detail": f"smoke-test: PyIceberg wrote {got['n']} rows, DuckDB read them back (notional {got['notional']})",
        "elapsedMs": int((time.time() - started) * 1000),
    }
