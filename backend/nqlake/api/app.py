"""Builds the FastAPI application."""

from __future__ import annotations

from fastapi import FastAPI

from nqlake.api.errors import register_error_handlers
from nqlake.api.routes import namespaces, parquet, query, status, tables
from nqlake.api.schemas import ErrorOut
from nqlake.config import Settings, load_settings

DESCRIPTION = """
Backend of the NQ Lake Iceberg lakehouse.

Tables live in the Lakekeeper REST catalog with data on MinIO. Every table the
API creates uses Iceberg format version 2. PyIceberg manages tables and rows;
DuckDB answers `/query`.

Errors share one shape: `{"error": "...", "problems": [...]}`. `problems` lists
one sentence per column when a schema is rejected.
"""


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="NQ Lake",
        version="0.1.0",
        description=DESCRIPTION,
        responses={422: {"model": ErrorOut}, 503: {"model": ErrorOut}},
    )
    app.state.settings = settings or load_settings()
    app.state.catalog = None
    app.state.duckdb = None
    register_error_handlers(app)
    for router in (status.router, namespaces.router, tables.router, parquet.router, query.router):
        app.include_router(router)
    return app
