"""Route dependencies: the settings, the catalog client, and the DuckDB engine of the process."""

from __future__ import annotations

import threading

import requests
from fastapi import Request
from pyiceberg.catalog.rest import RestCatalog

from nqlake.config import Settings
from nqlake.errors import Unavailable
from nqlake.lake.catalog import open_catalog
from nqlake.lake.query import Engine

_lock = threading.Lock()


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_catalog(request: Request) -> RestCatalog:
    """Returns the catalog client, opened on first use so the API starts before Lakekeeper does."""
    state = request.app.state
    with _lock:
        if getattr(state, "catalog", None) is None:
            try:
                state.catalog = open_catalog(state.settings)
            except requests.RequestException as exc:
                raise Unavailable(f"The catalog did not answer: {exc}") from exc
        return state.catalog


def get_duckdb(request: Request) -> Engine:
    """Returns the process's DuckDB engine; the database inside opens on the first query."""
    state = request.app.state
    with _lock:
        if getattr(state, "duckdb", None) is None:
            state.duckdb = Engine(state.settings)
        return state.duckdb
