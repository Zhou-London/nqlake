"""Turns an uploaded Parquet file into Arrow data an Iceberg v2 table accepts.

Parquet, through Arrow, carries types Iceberg lacks. Each such column gets one
of two treatments, chosen so the caller never guesses:

- a repair, applied and reported. Most are lossless (unsigned integers widen,
  float16 widens, dictionaries decode, non-UTC time zones convert to UTC).
  One truncates and is flagged ``lossy``: nanosecond timestamps and times
  drop to microseconds, the finest precision the v2 spec stores.
- a rejection that names the column and the fix (interval, duration, decimal
  precision above 38, a column with no type, ...).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
from pyiceberg.io.pyarrow import UTC_ALIASES, _ConvertToIcebergWithoutIDs, visit_pyarrow
from pyiceberg.schema import Schema

from nqlake.errors import Incompatible, InvalidRequest
from nqlake.lake import FORMAT_VERSION


@dataclass(frozen=True)
class Repair:
    column: str
    from_type: str
    to_type: str
    reason: str
    lossy: bool = False


@dataclass(frozen=True)
class ColumnReport:
    name: str
    parquet_type: str
    iceberg_type: str


@dataclass
class Prepared:
    data: pa.Table
    columns: list[ColumnReport]
    repairs: list[Repair] = field(default_factory=list)


def read_parquet(path: Path) -> pa.Table:
    """Reads the whole file into memory. Raises InvalidRequest for anything but Parquet."""
    try:
        return pq.read_table(path)
    except (pa.ArrowInvalid, OSError) as exc:
        raise InvalidRequest(f"The upload is not a readable Parquet file: {exc}") from exc


class _Planner:
    """Decides the Arrow type each column is cast to, collecting repairs and problems."""

    def __init__(self) -> None:
        self.repairs: list[Repair] = []
        self.problems: list[str] = []
        # Top-level columns whose cast truncates; cast with safe=False.
        self.lossy_columns: set[str] = set()

    def _repair(self, path: str, from_type: pa.DataType, to_type: pa.DataType, reason: str, lossy: bool = False) -> None:
        self.repairs.append(Repair(path, str(from_type), str(to_type), reason, lossy))
        if lossy:
            self.lossy_columns.add(path.split(".", 1)[0])

    def _problem(self, path: str, from_type: pa.DataType, fix: str) -> None:
        self.problems.append(f"Column {path!r} has type {from_type}: {fix}")

    def plan(self, path: str, t: pa.DataType) -> pa.DataType:
        """Returns the type to cast ``path`` to. Records a repair when the type changes."""
        if pa.types.is_dictionary(t):
            self._repair(path, t, t.value_type, "dictionary encoding decoded")
            return self.plan(path, t.value_type)
        if isinstance(t, pa.ExtensionType) and not isinstance(t, pa.UuidType):
            self._repair(path, t, t.storage_type, "extension type replaced by its storage type")
            return self.plan(path, t.storage_type)

        if pa.types.is_null(t):
            self._problem(path, t, "every value is null and no type is stored; cast the column to a concrete type.")
            return t
        if pa.types.is_boolean(t) or pa.types.is_signed_integer(t):
            return t
        if pa.types.is_unsigned_integer(t):
            widened = {8: pa.int32(), 16: pa.int32(), 32: pa.int64(), 64: pa.decimal128(20, 0)}[t.bit_width]
            self._repair(path, t, widened, "Iceberg has signed integers only; widened to hold every value")
            return widened
        if pa.types.is_float16(t):
            self._repair(path, t, pa.float32(), "Iceberg has no half-precision float")
            return pa.float32()
        if pa.types.is_float32(t) or pa.types.is_float64(t):
            return t
        if pa.types.is_decimal(t):
            if t.precision > 38:
                self._problem(path, t, "Iceberg decimals hold at most 38 digits; reduce the precision.")
                return t
            if pa.types.is_decimal256(t):
                narrow = pa.decimal128(t.precision, t.scale)
                self._repair(path, t, narrow, "same digits in the 128-bit decimal Iceberg stores")
                return narrow
            return t
        if pa.types.is_string(t) or pa.types.is_large_string(t) or pa.types.is_string_view(t):
            return t
        if pa.types.is_binary(t) or pa.types.is_large_binary(t) or pa.types.is_binary_view(t):
            return t
        if pa.types.is_fixed_size_binary(t) or isinstance(t, pa.UuidType):
            return t
        if pa.types.is_date32(t):
            return t
        if pa.types.is_date64(t):
            self._repair(path, t, pa.date32(), "Iceberg dates count days, not milliseconds")
            return pa.date32()
        if pa.types.is_time32(t):
            self._repair(path, t, pa.time64("us"), "Iceberg time has microsecond precision")
            return pa.time64("us")
        if pa.types.is_time64(t):
            if t.unit == "us":
                return t
            self._repair(path, t, pa.time64("us"), "nanoseconds truncated to microseconds", lossy=True)
            return pa.time64("us")
        if pa.types.is_timestamp(t):
            return self._plan_timestamp(path, t)
        if pa.types.is_duration(t) or pa.types.is_interval(t):
            self._problem(path, t, "Iceberg has no duration or interval type; store a number of units instead.")
            return t

        if pa.types.is_list(t) or pa.types.is_large_list(t) or pa.types.is_fixed_size_list(t):
            element = t.value_field
            element_type = self.plan(f"{path}.element", element.type)
            planned = pa.list_(pa.field(element.name, element_type, element.nullable))
            if not pa.types.is_list(t):
                self._repair(path, t, planned, "Iceberg lists have no fixed size or 64-bit offsets")
            return planned
        if pa.types.is_struct(t):
            if t.num_fields == 0:
                self._problem(path, t, "an Iceberg struct needs at least one field.")
                return t
            fields = [pa.field(f.name, self.plan(f"{path}.{f.name}", f.type), f.nullable) for f in t]
            return pa.struct(fields)
        if pa.types.is_map(t):
            key_type = self.plan(f"{path}.key", t.key_type)
            value_type = self.plan(f"{path}.value", t.item_type)
            return pa.map_(pa.field("key", key_type, nullable=False), pa.field("value", value_type, t.item_field.nullable))

        self._problem(path, t, "no Iceberg equivalent exists.")
        return t

    def _plan_timestamp(self, path: str, t: pa.TimestampType) -> pa.DataType:
        tz = t.tz
        if tz is not None and tz not in UTC_ALIASES:
            tz = "UTC"
        planned = pa.timestamp("us", tz)
        if planned == t:
            return t
        if t.unit == "ns":
            self._repair(path, t, planned, "nanoseconds truncated to microseconds", lossy=True)
        elif t.unit != "us":
            self._repair(path, t, planned, "Iceberg timestamps have microsecond precision")
        else:
            self._repair(path, t, planned, "Iceberg stores UTC; the instants are unchanged")
        return planned


def prepare(data: pa.Table) -> Prepared:
    """Casts ``data`` to types an Iceberg v2 table accepts and reports each change.

    Raises Incompatible with one problem per column that no repair covers.
    Field metadata is dropped: field ids left by another Iceberg table would
    collide with the target's.
    """
    names = data.column_names
    problems = [f"Column {n!r} appears {names.count(n)} times; Iceberg needs unique names." for n in sorted(set(names)) if names.count(n) > 1]
    if "" in names:
        problems.append("A column has an empty name; Iceberg needs a name for every column.")
    if problems:
        raise Incompatible("The Parquet schema cannot be stored in Iceberg.", problems)

    planner = _Planner()
    fields = [pa.field(f.name, planner.plan(f.name, f.type), f.nullable) for f in data.schema]
    if planner.problems:
        raise Incompatible("The Parquet schema cannot be stored in Iceberg.", planner.problems)

    columns = []
    for source, target in zip(data.schema, fields, strict=True):
        column = data.column(source.name)
        if isinstance(source.type, pa.ExtensionType) and not isinstance(source.type, pa.UuidType):
            column = pa.chunked_array([chunk.storage for chunk in column.chunks], source.type.storage_type)
        if column.type != target.type:
            column = pc.cast(column, target.type, safe=source.name not in planner.lossy_columns)
        columns.append(column)
    schema = pa.schema(fields)
    prepared = pa.table(columns, schema=schema)

    # PyIceberg's own conversion is the final word on what it will write.
    try:
        iceberg_schema: Schema = visit_pyarrow(schema, _ConvertToIcebergWithoutIDs(format_version=FORMAT_VERSION))
    except (TypeError, ValueError) as exc:
        raise Incompatible("PyIceberg cannot map the Parquet schema to Iceberg.", [str(exc)]) from exc

    # Positional: the converter gives every field the placeholder id -1, so a lookup by name is ambiguous.
    report = [
        ColumnReport(source.name, str(source.type), str(converted.field_type))
        for source, converted in zip(data.schema, iceberg_schema.fields, strict=True)
    ]
    return Prepared(prepared, report, planner.repairs)
