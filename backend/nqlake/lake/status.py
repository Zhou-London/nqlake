"""Health of every service the lake runs on, checked live on each call."""

from __future__ import annotations

import socket
from dataclasses import dataclass

import duckdb
import requests
from pyiceberg.catalog.rest import RestCatalog

from nqlake.config import Settings
from nqlake.errors import Unavailable
from nqlake.lake.query import Engine


@dataclass(frozen=True)
class ServiceStatus:
    name: str
    ok: bool
    # One sentence: the version or count on success, the failure on error.
    detail: str
    port: int | None = None


@dataclass(frozen=True)
class Status:
    ok: bool
    warehouse: str
    services: list[ServiceStatus]


def _http_session() -> requests.Session:
    # Every service is reached on localhost; a system proxy would only get in the way.
    session = requests.Session()
    session.trust_env = False
    return session


def _check_lakekeeper(settings: Settings) -> ServiceStatus:
    try:
        body = _http_session().get(f"{settings.lakekeeper_url}/health", timeout=3).json()
    except (requests.RequestException, ValueError) as exc:
        return ServiceStatus("lakekeeper", False, f"unreachable: {exc}", settings.lakekeeper_port)
    ok = body.get("health") == "ok"
    return ServiceStatus("lakekeeper", ok, f"health={body.get('health')}", settings.lakekeeper_port)


def _check_minio(settings: Settings) -> ServiceStatus:
    try:
        response = _http_session().get(f"{settings.minio_url}/minio/health/live", timeout=3)
    except requests.RequestException as exc:
        return ServiceStatus("minio", False, f"unreachable: {exc}", settings.minio_api_port)
    return ServiceStatus("minio", response.ok, f"HTTP {response.status_code}", settings.minio_api_port)


def _check_postgres(settings: Settings) -> ServiceStatus:
    # Postgres speaks no HTTP; an open TCP port is the check. Lakekeeper's
    # health above covers the connection pools on top of it.
    try:
        with socket.create_connection((settings.host, settings.postgres_port), timeout=3):
            pass
    except OSError as exc:
        return ServiceStatus("postgres", False, f"port closed: {exc}", settings.postgres_port)
    return ServiceStatus("postgres", True, "port open", settings.postgres_port)


def _check_catalog(catalog: RestCatalog, settings: Settings) -> ServiceStatus:
    try:
        namespaces = catalog.list_namespaces()
    except Exception as exc:  # noqa: BLE001 - any failure is the status, not a crash
        return ServiceStatus("catalog", False, f"warehouse {settings.warehouse!r}: {exc}")
    return ServiceStatus("catalog", True, f"warehouse {settings.warehouse!r}, {len(namespaces)} namespaces")


def _check_duckdb(engine: Engine) -> ServiceStatus:
    try:
        with engine.cursor() as cur:
            cur.execute("SELECT 1")
    except (duckdb.Error, Unavailable) as exc:
        return ServiceStatus("duckdb", False, f"{duckdb.__version__}: {exc}")
    return ServiceStatus("duckdb", True, f"{duckdb.__version__} with the catalog attached")


def check_all(catalog: RestCatalog, engine: Engine, settings: Settings) -> Status:
    """Probes every service. ``ok`` is true only when all of them answer."""
    services = [
        _check_lakekeeper(settings),
        _check_minio(settings),
        _check_postgres(settings),
        _check_catalog(catalog, settings),
        _check_duckdb(engine),
    ]
    return Status(ok=all(s.ok for s in services), warehouse=settings.warehouse, services=services)
