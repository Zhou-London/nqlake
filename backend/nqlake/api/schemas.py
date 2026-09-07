"""Request and response bodies of the API."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Output models read the lake layer's dataclasses field by field.
_FROM_ATTRIBUTES = ConfigDict(from_attributes=True)


class ErrorOut(BaseModel):
    error: str
    # One entry per offending column when a schema is rejected; empty otherwise.
    problems: list[str] = []


class ServiceOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    name: str
    ok: bool
    detail: str
    port: int | None = None


class StatusOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    ok: bool
    warehouse: str
    services: list[ServiceOut]


class NamespaceIn(BaseModel):
    # Dot-separated levels: ``raw`` or ``raw.futures``.
    name: str = Field(examples=["raw"])


class ColumnIn(BaseModel):
    name: str
    # An Iceberg primitive type name; nested types arrive through Parquet uploads.
    type: str = Field(examples=["long", "timestamptz", "decimal(20,0)"])
    required: bool = False
    doc: str | None = None


class TableIn(BaseModel):
    name: str
    columns: list[ColumnIn]
    # Entries such as ``symbol``, ``day(ts_event)``, or ``bucket[16](order_id)``.
    partition_by: list[str] = []
    properties: dict[str, str] = {}


class TableUpdateIn(BaseModel):
    rename_to: str | None = None
    set_properties: dict[str, str] = {}
    remove_properties: list[str] = []
    add_columns: list[ColumnIn] = []


class ColumnOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    id: int
    name: str
    type: str
    required: bool
    doc: str | None


class TableOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    namespace: str
    name: str
    format_version: int
    location: str
    columns: list[ColumnOut]
    partition_by: list[str]
    properties: dict[str, str]
    snapshot_id: int | None
    snapshot_at: dt.datetime | None
    row_count: int | None
    snapshot_count: int


class RowsOut(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int


class RowsIn(BaseModel):
    rows: list[dict[str, Any]] = Field(min_length=1)


class WriteOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    rows: int
    snapshot_id: int | None


class QueryIn(BaseModel):
    sql: str = Field(examples=["SELECT count(*) FROM lake.raw.nq_futures_mbo"])
    limit: int = Field(default=100, ge=1, le=10_000)


class RepairOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    column: str
    from_type: str
    to_type: str
    reason: str
    lossy: bool


class ColumnReportOut(BaseModel):
    model_config = _FROM_ATTRIBUTES
    name: str
    parquet_type: str
    iceberg_type: str


class InspectOut(BaseModel):
    rows: int
    columns: list[ColumnReportOut]
    repairs: list[RepairOut]


class UploadOut(BaseModel):
    namespace: str
    table: str
    # True when the upload created the table.
    created: bool
    mode: Literal["append", "overwrite"]
    rows: int
    snapshot_id: int | None
    repairs: list[RepairOut]
