import shutil
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from pyiceberg.catalog.rest import RestCatalog

from nqlake.api.deps import get_catalog
from nqlake.api.schemas import RowsIn, RowsOut, TableOut, TableUpdateIn, UploadOut, WriteOut
from nqlake.errors import NotFound
from nqlake.lake import parquet, tables
from nqlake.lake.rows import arrow_to_json, json_to_arrow
from nqlake.lake.tables import ColumnSpec, TableUpdate

router = APIRouter(prefix="/namespaces/{namespace}/tables/{table}", tags=["tables"])


@router.get("", response_model=TableOut, summary="Describe a table")
def describe_table(namespace: str, table: str, catalog: RestCatalog = Depends(get_catalog)) -> TableOut:
    return TableOut.model_validate(tables.describe(tables.load(catalog, namespace, table)))


@router.patch("", response_model=TableOut, summary="Rename, set properties, or add columns")
def update_table(
    namespace: str,
    table: str,
    body: TableUpdateIn,
    catalog: RestCatalog = Depends(get_catalog),
) -> TableOut:
    update = TableUpdate(
        rename_to=body.rename_to,
        set_properties=body.set_properties,
        remove_properties=body.remove_properties,
        add_columns=[ColumnSpec(c.name, c.type, c.required, c.doc) for c in body.add_columns],
    )
    updated = tables.update_table(catalog, tables.load(catalog, namespace, table), update)
    return TableOut.model_validate(tables.describe(updated))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Drop a table")
def drop_table(
    namespace: str,
    table: str,
    purge: bool = Query(False, description="Also delete the table's files from storage."),
    catalog: RestCatalog = Depends(get_catalog),
) -> Response:
    tables.drop_table(catalog, namespace, table, purge)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/rows", response_model=RowsOut, summary="Read rows")
def read_rows(
    namespace: str,
    table: str,
    filter: str | None = Query(None, description="Iceberg row filter, e.g. `price > 10 AND side = 'A'`."),
    columns: str | None = Query(None, description="Comma-separated column names; every column when omitted."),
    limit: int = Query(100, ge=1, le=10_000),
    catalog: RestCatalog = Depends(get_catalog),
) -> RowsOut:
    selected = [c.strip() for c in columns.split(",") if c.strip()] if columns else None
    data = tables.read_rows(tables.load(catalog, namespace, table), filter, selected, limit)
    return RowsOut(columns=data.column_names, rows=arrow_to_json(data), row_count=data.num_rows)


@router.post("/rows", response_model=WriteOut, status_code=status.HTTP_201_CREATED, summary="Append JSON rows")
def append_rows(namespace: str, table: str, body: RowsIn, catalog: RestCatalog = Depends(get_catalog)) -> WriteOut:
    target = tables.load(catalog, namespace, table)
    data = json_to_arrow(body.rows, target.schema().as_arrow())
    return WriteOut.model_validate(tables.write_arrow(target, data, "append"))


@router.delete("/rows", response_model=WriteOut, summary="Delete the rows matching a filter")
def delete_rows(
    namespace: str,
    table: str,
    filter: str = Query(..., description="Iceberg row filter; `true` deletes every row."),
    catalog: RestCatalog = Depends(get_catalog),
) -> WriteOut:
    target = tables.load(catalog, namespace, table)
    return WriteOut.model_validate(tables.delete_rows(target, filter))


@router.post("/parquet", response_model=UploadOut, status_code=status.HTTP_201_CREATED, summary="Upload a Parquet file")
def upload_parquet(
    namespace: str,
    table: str,
    file: UploadFile = File(..., description="A Parquet file."),
    mode: Literal["append", "overwrite"] = Form("append"),
    create: bool = Form(True, description="Create the table from the file's schema when it does not exist."),
    catalog: RestCatalog = Depends(get_catalog),
) -> UploadOut:
    """Writes the file's rows into the table, repairing Parquet types Iceberg lacks.

    Repairs (unsigned integers, dictionaries, non-UTC zones, nanoseconds to
    microseconds, ...) are applied and listed in the response; a repair that
    truncates is flagged `lossy`. Anything else is rejected with one problem
    per column and nothing is written.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "upload.parquet"
        with path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        prepared = parquet.prepare(parquet.read_parquet(path))

    created = False
    try:
        target = tables.load(catalog, namespace, table)
    except NotFound:
        if not create:
            raise
        target = tables.create_table_from_arrow(catalog, namespace, table, prepared.data.schema)
        created = True
    result = tables.write_arrow(target, prepared.data, mode)
    return UploadOut(
        namespace=namespace,
        table=table,
        created=created,
        mode=mode,
        rows=result.rows,
        snapshot_id=result.snapshot_id,
        repairs=prepared.repairs,
    )
