from fastapi import APIRouter, Depends

from nqlake.api.deps import get_duckdb
from nqlake.api.schemas import QueryIn, RowsOut
from nqlake.lake.query import Engine, run_query
from nqlake.lake.rows import arrow_to_json

router = APIRouter(tags=["query"])


@router.post("/query", response_model=RowsOut, summary="Run read-only SQL with DuckDB")
def query(body: QueryIn, engine: Engine = Depends(get_duckdb)) -> RowsOut:
    """Runs one SQL statement against the catalog, attached as `lake`."""
    data = run_query(engine, body.sql, body.limit)
    return RowsOut(columns=data.column_names, rows=arrow_to_json(data), row_count=data.num_rows)
