from pathlib import Path

from fastapi import APIRouter, Depends, status

from nqlake.api.deps import get_duckdb, get_settings
from nqlake.api.schemas import ArrowStreamOut, QueryIn, QueryStreamIn, RowsOut
from nqlake.config import Settings
from nqlake.lake import stream
from nqlake.lake.query import Engine, run_query
from nqlake.lake.rows import arrow_to_json

router = APIRouter(tags=["query"])


@router.post("/query", response_model=RowsOut, summary="Run read-only SQL with DuckDB")
def query(body: QueryIn, engine: Engine = Depends(get_duckdb)) -> RowsOut:
    """Runs one SQL statement against the catalog, attached as `lake`."""
    data = run_query(engine, body.sql, body.limit)
    return RowsOut(columns=data.column_names, rows=arrow_to_json(data), row_count=data.num_rows)


@router.post(
    "/query/arrow",
    response_model=ArrowStreamOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send read-only SQL results as an Arrow IPC stream over a Unix socket",
)
def query_arrow(
    body: QueryStreamIn,
    engine: Engine = Depends(get_duckdb),
    settings: Settings = Depends(get_settings),
) -> ArrowStreamOut:
    """Starts one transfer: the rows of the statement go to whoever connects to the socket first.

    The response carries no rows. It returns once the socket at `socket_path`
    (the `ARROW_SOCKET_PATH` of `.env` unless the body names one) accepts
    connections. Connect to it and read with `pyarrow.ipc.open_stream`: the
    schema, one record batch of `batch_size` rows at a time, then the
    end-of-stream marker. A rejected statement answers 422 here, before the
    socket is bound.
    """
    socket_path = Path(body.socket_path) if body.socket_path else settings.arrow_socket_path
    transfer = stream.start_transfer(engine, body.sql, body.batch_size, socket_path)
    return ArrowStreamOut.model_validate(transfer)
