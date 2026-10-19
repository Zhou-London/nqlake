from fastapi import APIRouter, Depends, Response, status

from nqlake.api.deps import get_duckdb, get_settings
from nqlake.api.schemas import ArrowTransferOut, QueryIn, QueryStreamIn, RowsOut
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
    response_model=ArrowTransferOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send read-only SQL results as an Arrow IPC stream over TCP",
)
def query_arrow(
    body: QueryStreamIn,
    engine: Engine = Depends(get_duckdb),
    settings: Settings = Depends(get_settings),
) -> ArrowTransferOut:
    """Starts one transfer: the rows of the statement go to whoever connects to the port first.

    The response carries no rows. It returns once `host:port` accepts
    connections: `ARROW_HOST` of `.env` (`0.0.0.0`, every interface, by
    default) and its `ARROW_PORT` unless the body names a port, or any
    free port when the body says 0. A receiver on another machine connects
    to this machine's address on that port.
    Connect to it and read with `pyarrow.ipc.open_stream`: the schema, one
    record batch of `batch_size` rows at a time, then the end-of-stream
    marker. The port stays bound until a receiver connects or
    `DELETE /query/arrow/{id}` stops it. A rejected statement answers 422
    here, before the port is bound; a port with a transfer already waiting
    or running answers 409.
    """
    port = settings.arrow_port if body.port is None else body.port
    transfer = stream.start_transfer(engine, body.sql, body.batch_size, settings.arrow_host, port)
    return ArrowTransferOut.model_validate(transfer)


@router.get(
    "/query/arrow",
    response_model=list[ArrowTransferOut],
    summary="List Arrow transfers: the active ones and the most recent finished ones",
)
def list_arrow() -> list[ArrowTransferOut]:
    """Newest first. `waiting` and `running` transfers hold their port; the rest are kept for their log."""
    return [ArrowTransferOut.model_validate(t) for t in stream.list_transfers()]


@router.delete(
    "/query/arrow/{transfer_id}",
    response_model=ArrowTransferOut,
    summary="Stop a transfer: unbind a waiting port, or cut a stream a receiver is reading",
)
def stop_arrow(transfer_id: int) -> ArrowTransferOut:
    """Releases the query and the port, and returns the transfer as it ended.

    A receiver reading the stream gets a truncated message, so its reader
    raises instead of taking the rows so far for the whole result. Answers
    404 for an unknown id and 409 for a transfer that already ended.
    """
    return ArrowTransferOut.model_validate(stream.stop_transfer(transfer_id))
