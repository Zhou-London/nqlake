"""Sends a query result as an Arrow IPC stream over a TCP connection.

The API only triggers a transfer. ``start_transfer`` binds a port on the
configured interface and returns; a thread then waits for one receiver to
connect and writes the stream to it: the schema, one record batch of
``batch_size`` rows at a time, and the end-of-stream marker. The receiver
reads with ``pyarrow.ipc.open_stream`` on the connection, batch by batch,
while the query is still running. The port stays bound until a receiver
connects or ``stop_transfer`` gives it up; nothing expires on its own, and
``stop_transfer`` also cuts a stream a receiver is reading. A stream that
ends early, for a query error or a stop, ends with a truncated message, so
the receiver's reader raises rather than returning the rows so far as a
complete result.

Every transfer of the process is kept with its state, its row count, and a
short log, the active ones and the most recent finished ones, so that
``list_transfers`` can show what is bound and what happened.
"""

from __future__ import annotations

import logging
import select
import socket
import struct
import threading
from contextlib import ExitStack
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum

import duckdb
import pyarrow as pa

from nqlake.errors import AlreadyExists, InvalidRequest, NotFound, Unavailable
from nqlake.lake.query import Engine, arrow_reader

log = logging.getLogger(__name__)

# Rows per record batch. 2^16 rows keep one batch of a wide table at tens of
# megabytes; DuckDB's default of one million would not.
DEFAULT_BATCH_ROWS = 65_536

# Finished transfers kept for ``list_transfers`` after the active ones.
_KEEP_FINISHED = 20

# Seconds ``stop_transfer`` waits for the sending thread to release the
# port, so that it is free again when the call returns.
_RELEASE_TIMEOUT = 5.0

# An Arrow IPC message starts with this marker and the length of its
# metadata. ``_break_stream`` sends the two and nothing after them.
_CONTINUATION = 0xFFFFFFFF
_MISSING_MESSAGE_BYTES = 1 << 20


class State(StrEnum):
    WAITING = "waiting"  # bound, no receiver yet
    RUNNING = "running"  # a receiver reads the stream
    DONE = "done"  # every row and the end-of-stream marker were sent
    FAILED = "failed"  # the query or the connection failed
    ABANDONED = "abandoned"  # stopped before a receiver connected
    CLOSED = "closed"  # stopped while a receiver was reading


ACTIVE = frozenset({State.WAITING, State.RUNNING})


@dataclass(frozen=True)
class LogEntry:
    time: datetime
    message: str


@dataclass(frozen=True)
class Transfer:
    """A snapshot of one transfer, as the API reports it."""

    id: int
    host: str
    port: int
    batch_size: int
    sql: str
    state: State
    started: datetime
    ended: datetime | None
    rows: int
    receiver: str | None
    log: tuple[LogEntry, ...]


# Every transfer this process knows, by id, in start order.
_transfers: dict[int, _Transfer] = {}
_lock = threading.Lock()
_next_id = 1


def start_transfer(engine: Engine, sql: str, batch_size: int, host: str, port: int) -> Transfer:
    """Binds the statement and the port on the host, then streams the result to the first receiver in a thread.

    Returns once the port accepts connections, so the caller can connect
    right away; port 0 binds any free port, and the returned Transfer names
    it. The host is an interface address of this machine, or ``0.0.0.0``
    for all of them; the stream has no authentication, so whoever can reach
    the port reads the result. Raises InvalidRequest for a rejected
    statement or a port the socket cannot bind, and AlreadyExists while an
    earlier transfer of this process still holds the port.
    """
    # Everything the transfer holds, released in reverse order when it ends:
    # the DuckDB cursor, the registry entry, then the sockets.
    resources = ExitStack()
    try:
        cur = resources.enter_context(engine.cursor())
        reader = arrow_reader(cur, sql, batch_size)
        transfer = resources.enter_context(_Transfer(host, port, batch_size, sql))
        if port:
            _register(transfer)
            resources.callback(_finish, transfer)
        transfer.listen()
        if not port:
            # An ephemeral port: register it now that the socket picked it.
            _register(transfer)
            resources.callback(_finish, transfer)
    except BaseException:
        resources.close()
        raise
    threading.Thread(
        target=_send,
        args=(transfer, reader, resources),
        name=f"arrow-stream {transfer.port}",
        daemon=True,
    ).start()
    return transfer.snapshot()


def list_transfers() -> list[Transfer]:
    """Every active transfer and the most recent finished ones, newest first."""
    with _lock:
        return [t.snapshot() for t in sorted(_transfers.values(), key=lambda t: t.id, reverse=True)]


def stop_transfer(transfer_id: int) -> Transfer:
    """Ends a transfer: unbinds a waiting port, or cuts the stream a receiver is reading.

    Returns once the sending thread has released the port and the DuckDB
    cursor, so the port is free for the next transfer. Raises NotFound when
    no transfer has the id, and AlreadyExists when it already ended.
    """
    with _lock:
        transfer = _transfers.get(transfer_id)
        if transfer is None:
            raise NotFound(f"No transfer has id {transfer_id}.")
        if transfer.state not in ACTIVE:
            raise AlreadyExists(f"Transfer {transfer_id} already ended: {transfer.state}.")
        transfer.stop()
    if not transfer.released.wait(_RELEASE_TIMEOUT):
        log.warning("arrow stream %d: stopped, but port %d is still being released", transfer_id, transfer.port)
    return transfer.snapshot()


def _register(transfer: _Transfer) -> None:
    """Gives the transfer an id and records it. Raises AlreadyExists while another transfer holds its port."""
    global _next_id
    with _lock:
        for other in _transfers.values():
            if other.port == transfer.port and other.state in ACTIVE:
                raise AlreadyExists(f"A transfer is already waiting or running on port {transfer.port}.")
        transfer.id = _next_id
        _next_id += 1
        _transfers[transfer.id] = transfer
        # Keep the list bounded: drop the oldest finished transfers.
        finished = [t for t in _transfers.values() if t.state not in ACTIVE]
        for old in finished[: max(0, len(finished) - _KEEP_FINISHED)]:
            del _transfers[old.id]


def _finish(transfer: _Transfer) -> None:
    """Marks the transfer ended, which frees its port for the next one."""
    with _lock:
        if transfer.state in ACTIVE:
            transfer.set_state(State.FAILED, "Ended without a result.")
    transfer.released.set()


class _Transfer:
    """One transfer: its sockets, its state, its log, and the switches that stop it.

    ``wait`` blocks in ``select`` on the listener and on one end of a
    socketpair; ``stop`` writes to the other end, which is what wakes the
    sending thread on every platform (closing a listener from another thread
    does not, on macOS). State is read and written under ``_lock`` so that a
    stop and an accept cannot both win.
    """

    def __init__(self, host: str, port: int, batch_size: int, sql: str) -> None:
        self.id = 0
        self.host = host
        self.port = port
        self.batch_size = batch_size
        self.sql = sql
        self.state = State.WAITING
        self.started = _now()
        self.ended: datetime | None = None
        self.rows = 0
        self.receiver: str | None = None
        self.log: list[LogEntry] = []
        self._listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # A port whose last connection is in TIME_WAIT would otherwise refuse
        # to bind for a minute after each transfer.
        self._listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._wake_recv, self._wake_send = socket.socketpair()
        self._conn: socket.socket | None = None
        # Held while a batch is being sent, so that a stop can tell a writer
        # blocked mid-message from one that is between messages.
        self._sending = threading.Lock()
        self.stopping = False
        # Set once the transfer's resources are released and the port is free.
        self.released = threading.Event()

    def __enter__(self) -> _Transfer:
        return self

    def __exit__(self, *_: object) -> None:
        self._listener.close()
        self._wake_recv.close()
        self._wake_send.close()

    def snapshot(self) -> Transfer:
        return Transfer(
            id=self.id,
            host=self.host,
            port=self.port,
            batch_size=self.batch_size,
            sql=self.sql,
            state=self.state,
            started=self.started,
            ended=self.ended,
            rows=self.rows,
            receiver=self.receiver,
            log=tuple(self.log),
        )

    def note(self, message: str) -> None:
        """Appends a log line. Called under ``_lock``."""
        self.log.append(LogEntry(_now(), message))

    def set_state(self, state: State, message: str) -> None:
        """Moves to a final or running state and logs why. Called under ``_lock``."""
        self.state = state
        if state not in ACTIVE:
            self.ended = _now()
        self.note(message)

    def listen(self) -> None:
        """Binds the listener and records the bound port. Raises InvalidRequest when it cannot be bound."""
        try:
            self._listener.bind((self.host, self.port))
            self._listener.listen(1)
        except OSError as exc:
            raise InvalidRequest(f"Cannot bind {self.host}:{self.port}: {exc.strerror or exc}") from exc
        self._listener.setblocking(False)
        self.port = self._listener.getsockname()[1]
        with _lock:
            self.note(f"Bound {self.host}:{self.port}; waiting for a receiver.")

    def wait(self) -> socket.socket | None:
        """Blocks until a receiver connects and returns its connection, or returns None once stopped."""
        while True:
            readable, _, _ = select.select([self._listener, self._wake_recv], [], [])
            with _lock:
                if self.stopping:
                    self.set_state(State.ABANDONED, "Abandoned before a receiver connected.")
                    return None
                if self._listener in readable:
                    try:
                        conn, peer = self._listener.accept()
                    except BlockingIOError:
                        continue  # The connection went away between select and accept.
                    self._conn = conn
                    self.receiver = f"{peer[0]}:{peer[1]}"
                    self.set_state(State.RUNNING, f"Receiver connected from {self.receiver}.")
                    return conn

    def send_batch(self, writer: pa.ipc.RecordBatchStreamWriter, batch: pa.RecordBatch) -> bool:
        """Sends one batch unless the transfer is being stopped. Returns False once it is."""
        with self._sending:
            if self.stopping:
                return False
            writer.write_batch(batch)
        with _lock:
            self.rows += batch.num_rows
        return True

    def stop(self) -> None:
        """Wakes a waiting transfer, or cuts the connection of a running one. Called under ``_lock``."""
        self.stopping = True
        if self._conn is None:
            self._wake_send.sendall(b"\0")
            return
        # A writer between batches holds nothing and will see the flag; then
        # the stream can still end with a truncated message, which every
        # reader rejects. A writer blocked inside sendall keeps the lock, and
        # the shutdown below interrupts it mid-message, which readers reject
        # as well.
        if self._sending.acquire(timeout=0.2):
            try:
                self._conn.settimeout(1.0)
                _break_stream(self._conn)
            finally:
                self._sending.release()
        try:
            self._conn.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass  # Already gone.


def _send(transfer: _Transfer, reader: pa.RecordBatchReader, resources: ExitStack) -> None:
    """Waits for the receiver, writes the whole stream to it, and releases the transfer's resources."""
    try:
        with resources:
            _write_stream(transfer, reader)
    except Unavailable as exc:
        # A transport failure to the lake. The cursor context closed the
        # database, so the next request reopens it, as for any request.
        log.error("arrow stream %d: %s", transfer.id, exc)
        with _lock:
            transfer.set_state(State.FAILED, f"Stopped after {transfer.rows} rows: {exc}")


def _write_stream(transfer: _Transfer, reader: pa.RecordBatchReader) -> None:
    """Writes the schema, every record batch, and the end-of-stream marker to the first connection."""
    conn = transfer.wait()
    if conn is None:
        log.info("arrow stream %d: abandoned before a receiver connected", transfer.id)
        return
    with conn:
        conn.setblocking(True)
        # One record batch is one large write; Nagle's algorithm would only
        # hold back the small header of the next one.
        conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        batches = 0
        try:
            writer = pa.ipc.new_stream(_SocketSink(conn), reader.schema)
            for batch in reader:
                if not transfer.send_batch(writer, batch):
                    break
                batches += 1
            else:
                writer.close()
                with _lock:
                    transfer.set_state(State.DONE, f"Sent {transfer.rows} rows in {batches} batches.")
                log.info("arrow stream %d: sent %d rows", transfer.id, transfer.rows)
                return
        except duckdb.HTTPException as exc:
            _break_stream(conn)
            with _lock:
                transfer.set_state(State.FAILED, f"Stopped after {transfer.rows} rows: {exc}")
            raise
        except (OSError, duckdb.Error, pa.ArrowException) as exc:
            if not transfer.stopping:
                log.error("arrow stream %d: stopped after %d rows: %s", transfer.id, transfer.rows, exc)
                _break_stream(conn)
                with _lock:
                    transfer.set_state(State.FAILED, f"Stopped after {transfer.rows} rows: {exc}")
                return
        # The transfer was stopped while the receiver read it.
        log.info("arrow stream %d: closed after %d rows", transfer.id, transfer.rows)
        with _lock:
            transfer.set_state(State.CLOSED, f"Closed by request after {transfer.rows} rows.")


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


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
