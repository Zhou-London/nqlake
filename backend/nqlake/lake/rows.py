"""Converts rows between Arrow and JSON-safe Python values."""

from __future__ import annotations

import base64
import datetime as dt
import math
import uuid
from decimal import Decimal
from typing import Any

import pyarrow as pa
import pyarrow.compute as pc
from pyiceberg.table import Table

from nqlake.errors import InvalidRequest


def _json_value(value: Any) -> Any:
    """Maps one Arrow scalar's Python form to a value ``json.dumps`` accepts without loss.

    Decimals become strings: their digits exceed what a JSON number keeps.
    NaN and infinity become null: JSON has no spelling for them.
    """
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(v) for v in value]
    return str(value)


def _ns_timestamps_to_text(table: pa.Table) -> pa.Table:
    """Replaces nanosecond timestamp columns with ISO-8601 strings.

    ``to_pylist`` refuses nanoseconds that ``datetime`` cannot hold; the text
    form keeps all nine digits.
    """
    for i, field in enumerate(table.schema):
        if not (pa.types.is_timestamp(field.type) and field.type.unit == "ns"):
            continue
        suffix = "+00:00" if field.type.tz else ""
        texts = []
        for value in pc.cast(table.column(i), pa.int64()).to_pylist():
            if value is None:
                texts.append(None)
                continue
            seconds, nanos = divmod(value, 1_000_000_000)
            base = dt.datetime.fromtimestamp(seconds, dt.UTC).strftime("%Y-%m-%dT%H:%M:%S")
            texts.append(f"{base}.{nanos:09d}{suffix}")
        table = table.set_column(i, field.name, pa.array(texts, pa.string()))
    return table


def arrow_to_json(table: pa.Table) -> list[dict[str, Any]]:
    """Returns the rows of ``table`` as dicts of JSON-safe values, in column order."""
    table = _ns_timestamps_to_text(table)
    return [{k: _json_value(v) for k, v in row.items()} for row in table.to_pylist()]


def _uuid_column(column: pa.ChunkedArray, name: str) -> pa.Array:
    """Parses UUID strings into the Arrow uuid extension type."""
    try:
        raw = [uuid.UUID(v).bytes if v is not None else None for v in column.to_pylist()]
    except (ValueError, AttributeError, TypeError) as exc:
        raise InvalidRequest(f"Column {name!r} needs UUID strings: {exc}") from exc
    return pa.ExtensionArray.from_storage(pa.uuid(), pa.array(raw, pa.binary(16)))


def json_to_arrow(rows: list[dict[str, Any]], target: pa.Schema) -> pa.Table:
    """Builds an Arrow table shaped like ``target`` from JSON rows.

    Strings are parsed into timestamps, dates, times, decimals, and UUIDs.
    Timestamps with a time zone need an offset in the string (``...Z`` or
    ``+08:00``). A column absent from every row is filled with nulls; a
    column absent from ``target`` is an error.
    """
    if not rows:
        raise InvalidRequest("No rows were given.")
    try:
        given = pa.Table.from_pylist(rows)
    except (pa.ArrowInvalid, pa.ArrowTypeError) as exc:
        raise InvalidRequest(f"Rows do not share one type per column: {exc}") from exc

    extra = sorted(set(given.column_names) - set(target.names))
    if extra:
        raise InvalidRequest(f"Columns not in the table: {', '.join(extra)}. Add them to the schema first.")

    columns = []
    for field in target:
        if field.name not in given.column_names:
            columns.append(pa.nulls(given.num_rows, field.type))
            continue
        column = given.column(field.name)
        try:
            if isinstance(field.type, pa.UuidType):
                column = _uuid_column(column, field.name)
            else:
                column = pc.cast(column, field.type)
        except (pa.ArrowInvalid, pa.ArrowNotImplementedError, pa.ArrowTypeError) as exc:
            raise InvalidRequest(f"Column {field.name!r} does not fit type {field.type}: {exc}") from exc
        columns.append(column)
    return pa.table(columns, names=target.names)


def mark_required(data: pa.Table, table: Table) -> pa.Table:
    """Flags columns that are required in ``table`` as non-nullable in ``data``.

    PyIceberg rejects a nullable Arrow column for a required Iceberg column,
    so the flag is set where the data has no nulls. A required column that
    is missing or holds nulls is an error naming the column.
    """
    required = {f.name for f in table.schema().fields if f.required}
    missing = sorted(required - set(data.column_names))
    if missing:
        raise InvalidRequest(f"Required columns are missing from the data: {', '.join(missing)}.")
    fields = []
    for field in data.schema:
        if field.name in required:
            nulls = data.column(field.name).null_count
            if nulls:
                raise InvalidRequest(f"Column {field.name!r} is required but has {nulls} null values.")
            field = field.with_nullable(False)
        fields.append(field)
    return data.cast(pa.schema(fields))
