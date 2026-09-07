"""Namespaces, tables, and their rows through the catalog with PyIceberg."""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from typing import Literal

import pyarrow as pa
from pydantic import TypeAdapter, ValidationError
from pyiceberg.catalog.rest import RestCatalog
from pyiceberg.expressions import AlwaysTrue
from pyiceberg.partitioning import PartitionField, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.table import Table
from pyiceberg.transforms import IdentityTransform, parse_transform
from pyiceberg.types import IcebergType, NestedField
from pyparsing import ParseException

from nqlake.errors import Incompatible, InvalidRequest
from nqlake.lake import FORMAT_VERSION
from nqlake.lake.catalog import catalog_errors, namespace_tuple, table_identifier
from nqlake.lake.rows import mark_required

WriteMode = Literal["append", "overwrite"]

_TYPE = TypeAdapter(IcebergType)
_TRANSFORMED = re.compile(r"^(\w+(?:\[\d+\])?)\((\w+)\)$")


@dataclass(frozen=True)
class ColumnSpec:
    name: str
    # An Iceberg primitive type name: int, long, string, timestamptz, decimal(20,0), ...
    type: str
    required: bool = False
    doc: str | None = None


@dataclass(frozen=True)
class ColumnInfo:
    id: int
    name: str
    type: str
    required: bool
    doc: str | None


@dataclass(frozen=True)
class TableInfo:
    namespace: str
    name: str
    format_version: int
    location: str
    columns: list[ColumnInfo]
    partition_by: list[str]
    properties: dict[str, str]
    snapshot_id: int | None
    snapshot_at: dt.datetime | None
    # Rows in the current snapshot, from its summary; None when no snapshot exists.
    row_count: int | None
    snapshot_count: int


@dataclass(frozen=True)
class WriteResult:
    rows: int
    snapshot_id: int | None


@dataclass(frozen=True)
class TableUpdate:
    rename_to: str | None = None
    set_properties: dict[str, str] = field(default_factory=dict)
    remove_properties: list[str] = field(default_factory=list)
    add_columns: list[ColumnSpec] = field(default_factory=list)


def _parse_type(spec: ColumnSpec) -> IcebergType:
    try:
        return _TYPE.validate_python(spec.type)
    except ValidationError as exc:
        raise InvalidRequest(
            f"Column {spec.name!r} has unknown type {spec.type!r}. Use an Iceberg primitive type "
            "such as int, long, float, double, string, boolean, date, time, timestamp, timestamptz, "
            "decimal(p,s), uuid, or binary."
        ) from exc


# --- namespaces -------------------------------------------------------------


def list_namespaces(catalog: RestCatalog) -> list[str]:
    with catalog_errors("the catalog"):
        return sorted(".".join(ns) for ns in catalog.list_namespaces())


def create_namespace(catalog: RestCatalog, namespace: str) -> None:
    with catalog_errors(f"namespace {namespace}"):
        catalog.create_namespace(namespace_tuple(namespace))


def drop_namespace(catalog: RestCatalog, namespace: str) -> None:
    with catalog_errors(f"namespace {namespace}"):
        catalog.drop_namespace(namespace_tuple(namespace))


# --- tables -----------------------------------------------------------------


def list_tables(catalog: RestCatalog, namespace: str) -> list[str]:
    with catalog_errors(f"namespace {namespace}"):
        return sorted(ident[-1] for ident in catalog.list_tables(namespace_tuple(namespace)))


def load(catalog: RestCatalog, namespace: str, table: str) -> Table:
    with catalog_errors(f"table {namespace}.{table}"):
        return catalog.load_table(table_identifier(namespace, table))


def describe(table: Table) -> TableInfo:
    schema = table.schema()
    snapshot = table.current_snapshot()
    summary = snapshot.summary if snapshot and snapshot.summary else {}
    total = summary.get("total-records")
    return TableInfo(
        namespace=".".join(table.name()[:-1]),
        name=table.name()[-1],
        format_version=table.format_version,
        location=table.location(),
        columns=[ColumnInfo(f.field_id, f.name, str(f.field_type), f.required, f.doc) for f in schema.fields],
        partition_by=[_partition_entry(schema, pf) for pf in table.spec().fields],
        properties=dict(table.properties),
        snapshot_id=snapshot.snapshot_id if snapshot else None,
        snapshot_at=dt.datetime.fromtimestamp(snapshot.timestamp_ms / 1000, dt.UTC) if snapshot else None,
        row_count=int(total) if total is not None else None,
        snapshot_count=len(table.snapshots()),
    )


def _partition_entry(schema: Schema, pf: PartitionField) -> str:
    """Renders a partition field the way ``create_table`` accepts it: ``symbol`` or ``day(ts)``."""
    column = schema.find_column_name(pf.source_id)
    return column if isinstance(pf.transform, IdentityTransform) else f"{pf.transform}({column})"


def _partition_spec(schema: Schema, partition_by: list[str]) -> PartitionSpec:
    """Builds a spec from entries like ``symbol``, ``day(ts)``, or ``bucket[16](id)``."""
    fields = []
    for i, entry in enumerate(partition_by):
        match = _TRANSFORMED.match(entry)
        transform_name, column = (match.group(1), match.group(2)) if match else ("identity", entry)
        try:
            transform = IdentityTransform() if transform_name == "identity" else parse_transform(transform_name)
            source = schema.find_field(column)
        except ValueError as exc:
            raise InvalidRequest(f"Partition entry {entry!r} is invalid: {exc}") from exc
        name = column if transform_name == "identity" else f"{column}_{transform_name.split('[')[0]}"
        fields.append(PartitionField(source_id=source.field_id, field_id=1000 + i, transform=transform, name=name))
    return PartitionSpec(*fields)


def create_table(
    catalog: RestCatalog,
    namespace: str,
    name: str,
    columns: list[ColumnSpec],
    partition_by: list[str] | None = None,
    properties: dict[str, str] | None = None,
) -> Table:
    """Creates an empty v2 table. Column types are Iceberg primitive type names."""
    if not columns:
        raise InvalidRequest("A table needs at least one column.")
    names = [c.name for c in columns]
    if len(set(names)) != len(names):
        raise InvalidRequest("Column names repeat; each column needs a unique name.")
    schema = Schema(
        *(
            NestedField(field_id=i, name=c.name, field_type=_parse_type(c), required=c.required, doc=c.doc)
            for i, c in enumerate(columns, start=1)
        )
    )
    with catalog_errors(f"table {namespace}.{name}"):
        return catalog.create_table(
            table_identifier(namespace, name),
            schema=schema,
            partition_spec=_partition_spec(schema, partition_by or []),
            properties={**(properties or {}), "format-version": str(FORMAT_VERSION)},
        )


def create_table_from_arrow(catalog: RestCatalog, namespace: str, name: str, data: pa.Schema) -> Table:
    """Creates an empty v2 table whose schema mirrors an Arrow schema (see ``parquet.prepare``)."""
    with catalog_errors(f"table {namespace}.{name}"):
        return catalog.create_table(
            table_identifier(namespace, name), schema=data, properties={"format-version": str(FORMAT_VERSION)}
        )


def drop_table(catalog: RestCatalog, namespace: str, name: str, purge: bool = False) -> None:
    """Removes the table from the catalog. ``purge`` also deletes its files from storage."""
    with catalog_errors(f"table {namespace}.{name}"):
        catalog.drop_table(table_identifier(namespace, name), purge_requested=purge)


def update_table(catalog: RestCatalog, table: Table, update: TableUpdate) -> Table:
    """Applies property and schema changes in one commit, then a rename if asked."""
    try:
        with table.transaction() as tx:
            if update.set_properties:
                tx.set_properties(update.set_properties)
            if update.remove_properties:
                tx.remove_properties(*update.remove_properties)
            if update.add_columns:
                with tx.update_schema() as schema:
                    for column in update.add_columns:
                        schema.add_column(column.name, _parse_type(column), doc=column.doc, required=column.required)
    except ValueError as exc:
        raise InvalidRequest(str(exc)) from exc
    if update.rename_to:
        namespace = ".".join(table.name()[:-1])
        with catalog_errors(f"table {namespace}.{update.rename_to}"):
            return catalog.rename_table(table.name(), table_identifier(namespace, update.rename_to))
    return table


# --- rows -------------------------------------------------------------------


def read_rows(table: Table, row_filter: str | None, columns: list[str] | None, limit: int) -> pa.Table:
    """Scans up to ``limit`` rows. ``row_filter`` is an Iceberg expression such as ``price > 10 AND side = 'A'``."""
    try:
        scan = table.scan(
            row_filter=row_filter or AlwaysTrue(),
            selected_fields=tuple(columns) if columns else ("*",),
            limit=limit,
        )
        return scan.to_arrow()
    except ParseException as exc:
        raise InvalidRequest(f"Row filter {row_filter!r} does not parse: {exc}") from exc
    except ValueError as exc:
        raise InvalidRequest(str(exc)) from exc


def write_arrow(table: Table, data: pa.Table, mode: WriteMode = "append") -> WriteResult:
    """Appends ``data`` or replaces every row with it. Raises Incompatible when the schemas differ."""
    data = mark_required(data, table)
    try:
        if mode == "append":
            table.append(data)
        else:
            table.overwrite(data)
    except (ValueError, TypeError) as exc:
        raise Incompatible("The data does not match the table schema.", [str(exc)]) from exc
    return WriteResult(rows=data.num_rows, snapshot_id=_snapshot_id(table))


def delete_rows(table: Table, row_filter: str) -> WriteResult:
    """Deletes the rows matching ``row_filter`` and returns the new snapshot id."""
    try:
        table.delete(delete_filter=row_filter)
    except ParseException as exc:
        raise InvalidRequest(f"Row filter {row_filter!r} does not parse: {exc}") from exc
    except ValueError as exc:
        raise InvalidRequest(str(exc)) from exc
    return WriteResult(rows=0, snapshot_id=_snapshot_id(table))


def _snapshot_id(table: Table) -> int | None:
    snapshot = table.current_snapshot()
    return snapshot.snapshot_id if snapshot else None
