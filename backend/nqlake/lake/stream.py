"""Sends a query result as an Arrow IPC stream over a Unix domain socket.

The API only triggers a transfer. ``start_transfer`` binds the socket and
returns; a thread then waits for one receiver to connect and writes the
stream to it: the schema, one record batch of ``batch_size`` rows at a time,
and the end-of-stream marker. The receiver reads with
``pyarrow.ipc.open_stream`` on the connected socket, batch by batch, while
the query is still running. A query that fails after the stream began ends
it with a truncated message, so the receiver's reader raises rather than
returning the rows so far as a complete result. The socket file is removed
when the transfer ends, however it ends.
"""

from __future__ import annotations

import logging
import socket
import struct
import threading
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path

import duckdb
import pyarrow as pa

from nqlake.errors import AlreadyExists, InvalidRequest, Unavailable
from nqlake.lake.query import Engine, arrow_reader

log = logging.getLogger(__name__)

# Rows per record batch. 2^16 rows keep one batch of a wide table at tens of
# megabytes; DuckDB's default of one million would not.
DEFAULT_BATCH_ROWS = 65_536

# Seconds a bound socket waits for its receiver. A transfer nobody connects
# to is abandoned after this, which frees the path and the DuckDB cursor.
RECEIVER_TIMEOUT = 60.0

# An Arrow IPC message starts with this marker and the length of its
# metadata. ``_break_stream`` sends the two and nothing after them.
_CONTINUATION = 0xFFFFFFFF
_MISSING_MESSAGE_BYTES = 1 << 20

# Socket paths with a transfer waiting or running in this process.
_active: set[Path] = set()
_active_lock = threading.Lock()


@dataclass(frozen=True)
class Transfer:
    socket_path: Path
    batch_size: int


def start_transfer(engine: Engine, sql: str, batch_size: int, socket_path: Path) -> Transfer:
    """Binds the statement and the socket, then streams the result to the first receiver in a thread.

    Returns once the socket accepts connections, so the caller can connect
    right away. Raises InvalidRequest for a rejected statement or a path the
    socket cannot bind, and AlreadyExists while an earlier transfer of this
    process still holds the path. A leftover socket file from an earlier
    process is replaced.
    """
    if not socket_path.is_absolute():
        raise InvalidRequest(f"Socket path {str(socket_path)!r} must be absolute.")
    # Everything the transfer holds, released in reverse order when it ends:
    # the DuckDB cursor, the path, then the listening socket.
    resources = ExitStack()
    try:
        cur = resources.enter_context(engine.cursor())
        reader = arrow_reader(cur, sql, batch_size)
        _claim(socket_path)
        resources.callback(_release, socket_path)
        listener = resources.enter_context(_listen(socket_path))
    except BaseException:
        resources.close()
        raise
    threading.Thread(
        target=_send,
        args=(listener, reader, socket_path, resources),
        name=f"arrow-stream {socket_path}",
        daemon=True,
    ).start()
    return Transfer(socket_path, batch_size)


def _claim(socket_path: Path) -> None:
    """Reserves the path for one transfer. Raises AlreadyExists while another transfer holds it."""
    with _active_lock:
        if socket_path in _active:
            raise AlreadyExists(f"A transfer is already waiting or running on socket {socket_path}.")
        _active.add(socket_path)


def _release(socket_path: Path) -> None:
    """Removes the socket file and frees the path for the next transfer."""
    socket_path.unlink(missing_ok=True)
    with _active_lock:
        _active.discard(socket_path)


def _listen(socket_path: Path) -> socket.socket:
    """Binds a listening socket at the path. Raises InvalidRequest when the path cannot be bound."""
    socket_path.unlink(missing_ok=True)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        listener.bind(str(socket_path))
        listener.listen(1)
    except OSError as exc:
        listener.close()
        raise InvalidRequest(f"Cannot bind socket {socket_path}: {exc}") from exc
    listener.settimeout(RECEIVER_TIMEOUT)
    return listener


def _send(listener: socket.socket, reader: pa.RecordBatchReader, socket_path: Path, resources: ExitStack) -> None:
    """Waits for the receiver, writes the whole stream to it, and releases the transfer's resources."""
    try:
        with resources:
            _write_stream(listener, reader, socket_path)
    except Unavailable as exc:
        # A transport failure to the lake. The cursor context closed the
        # database, so the next request reopens it, as for any request.
        log.error("arrow stream %s: %s", socket_path, exc)


def _write_stream(listener: socket.socket, reader: pa.RecordBatchReader, socket_path: Path) -> None:
    """Writes the schema, every record batch, and the end-of-stream marker to the first connection."""
    try:
        conn, _ = listener.accept()
    except TimeoutError:
        log.warning("arrow stream %s: no receiver connected within %.0f s", socket_path, RECEIVER_TIMEOUT)
        return
    rows = 0
    with conn:
        try:
            writer = pa.ipc.new_stream(_SocketSink(conn), reader.schema)
            for batch in reader:
                writer.write_batch(batch)
                rows += batch.num_rows
            writer.close()
        except duckdb.HTTPException:
            _break_stream(conn)
            raise
        except (OSError, duckdb.Error, pa.ArrowException) as exc:
            log.error("arrow stream %s: stopped after %d rows: %s", socket_path, rows, exc)
            _break_stream(conn)
            return
    log.info("arrow stream %s: sent %d rows", socket_path, rows)


def _break_stream(conn: socket.socket) -> None:
    """Ends the stream so that the receiver's reader raises instead of returning a partial result.

    Arrow readers take a clean end of file for the end of the stream, with
    or without the end-of-stream marker. The header of a message whose body
    never arrives is what every reader rejects.
    """
    try:
        conn.sendall(struct.pack("<Ii", _CONTINUATION, _MISSING_MESSAGE_BYTES))
    except OSError:
        pass  # The receiver is gone; there is nobody left to warn.


class _SocketSink:
    """A writable object for ``pyarrow.ipc.new_stream`` that sends every IPC message straight to the socket."""

    closed = False

    def __init__(self, conn: socket.socket) -> None:
        self._conn = conn

    def write(self, data: bytes) -> int:
        self._conn.sendall(data)
        return len(data)

    def flush(self) -> None:
        pass
