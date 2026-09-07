"""Read-only SQL over the lake with DuckDB, attached to the same REST catalog."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

import duckdb
import pyarrow as pa

from nqlake.config import Settings
from nqlake.errors import InvalidRequest, Unavailable

# The name the catalog is attached under: ``SELECT * FROM lake.raw.trades``.
ATTACH_NAME = "lake"


class Engine:
    """One DuckDB database per process, attached read-only to the catalog.

    The database opens on first use. Each request runs on its own cursor, a
    connection into the same database, so requests run in parallel and share
    the attached catalog and DuckDB's file caches.

    DuckDB asks the catalog for the table on every query, so a new snapshot
    (rows appended or deleted) is visible at once. A commit that changes only
    the schema, such as an added column, shows up about one second later:
    for that second DuckDB reads the previous metadata file. This holds for a
    fresh connection too, so reusing the database does not add staleness.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._con: duckdb.DuckDBPyConnection | None = None
        self._lock = threading.Lock()

    def _open(self) -> duckdb.DuckDBPyConnection:
        """Opens the database and attaches the catalog. Raises Unavailable when the catalog does not answer."""
        settings = self._settings
        con = duckdb.connect()
        try:
            # Extensions load from this directory, so the engine works
            # offline once they are present there.
            con.execute(f"SET extension_directory = '{settings.duckdb_extension_dir}'")
            con.execute("LOAD iceberg")
            con.execute("LOAD httpfs")
            con.execute("SET TimeZone = 'UTC'")
            # Vended credentials point at MinIO by its compose hostname; a
            # system HTTP proxy would answer 502 for it. Lakekeeper and MinIO
            # sit on localhost, so no proxy is ever needed here.
            con.execute("SET http_proxy = ''")
            if settings.s3_access_key and settings.s3_secret_key:
                # Covers the reads DuckDB makes outside the vended
                # credentials: right after another client commits, it fetches
                # the metadata file itself and would otherwise try AWS with no
                # credentials.
                con.execute(
                    "CREATE SECRET minio (TYPE s3, "
                    f"KEY_ID '{settings.s3_access_key}', SECRET '{settings.s3_secret_key}', "
                    f"ENDPOINT '{settings.host}:{settings.minio_api_port}', URL_STYLE 'path', USE_SSL false, "
                    f"REGION 'local-01', SCOPE 's3://{settings.bucket}')"
                )
            # Lakekeeper runs without authentication here, so the catalog is
            # attached inline with AUTHORIZATION_TYPE 'none' instead of through
            # an Iceberg secret. Vended credentials are DuckDB's default; the
            # option is spelled out because the comments above depend on it.
            con.execute(
                f"ATTACH '{settings.warehouse}' AS {ATTACH_NAME} (TYPE iceberg, ENDPOINT '{settings.catalog_uri}', "
                "AUTHORIZATION_TYPE 'none', ACCESS_DELEGATION_MODE 'vended_credentials', READ_ONLY)"
            )
        except duckdb.Error as exc:
            con.close()
            raise Unavailable(f"DuckDB could not attach the catalog: {exc}") from exc
        return con

    @contextmanager
    def cursor(self) -> Iterator[duckdb.DuckDBPyConnection]:
        """Yields a cursor for one request. A transport failure closes the database so the next request reopens it."""
        with self._lock:
            if self._con is None:
                self._con = self._open()
            con = self._con
        cursor = con.cursor()
        try:
            yield cursor
        except duckdb.HTTPException as exc:
            self.close()
            raise Unavailable(f"DuckDB could not reach the lake: {exc}") from exc
        finally:
            cursor.close()

    def close(self) -> None:
        with self._lock:
            if self._con is not None:
                self._con.close()
                self._con = None


def run_query(engine: Engine, sql: str, limit: int) -> pa.Table:
    """Runs one read-only SQL statement and returns at most ``limit`` rows as Arrow.

    Raises InvalidRequest for SQL DuckDB rejects, or for a statement that
    returns no rows (DDL, SET, ...).
    """
    with engine.cursor() as cur:
        try:
            relation = cur.sql(sql)
            if relation is None:
                raise InvalidRequest("The statement returns no rows. Send a query such as SELECT.")
            return relation.limit(limit).to_arrow_table()
        except duckdb.HTTPException:
            raise
        except duckdb.Error as exc:
            raise InvalidRequest(str(exc)) from exc
