"""Port configuration of the NQ Lake stack.

Every port the stack binds is a variable in .env — compose.yaml, the init
scripts, and this tooling all read the same value, and a service listens on
the same number it publishes. This module owns that file: the registry of
variables, reading and writing them, and the checks a new value must pass.
"""

import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"

MIN_PORT, MAX_PORT = 1, 65535

# The stack's ports, in the order the console lists them. `applies` is what
# has to be restarted before a change takes effect: the compose stack, or the
# console's own Node process. `url` is a browsable path, absent when the port
# speaks a protocol rather than HTTP.
PORTS = (
    {
        "key": "MINIO_API_PORT",
        "service": "minio",
        "label": "MinIO S3 API",
        "description": "Object store; also the endpoint Lakekeeper vends to query engines.",
        "applies": "stack",
    },
    {
        "key": "MINIO_CONSOLE_PORT",
        "service": "minio",
        "label": "MinIO web console",
        "description": "MinIO's own browser UI for buckets and users.",
        "applies": "stack",
        "url": "/",
    },
    {
        "key": "LAKEKEEPER_PORT",
        "service": "lakekeeper",
        "label": "Iceberg REST catalog",
        "description": "Catalog at /catalog, management API at /management, UI at /ui.",
        "applies": "stack",
        "url": "/ui",
    },
    {
        "key": "POSTGRES_PORT",
        "service": "postgres",
        "label": "Catalog database",
        "description": "Lakekeeper's metadata database; no table data passes through it.",
        "applies": "stack",
    },
    {
        "key": "CONSOLE_PORT",
        "service": "console",
        "label": "NQ Lake console",
        "description": "This console. `make console` reads it; a change needs that restarted.",
        "applies": "console",
        "url": "/",
    },
)

KEYS = tuple(p["key"] for p in PORTS)


def read_env() -> dict:
    """Parses KEY=VALUE pairs from the stack's .env file.

    Raises:
        RuntimeError: The file does not exist yet.
    """
    if not ENV_PATH.exists():
        raise RuntimeError(f"no {ENV_PATH} — copy .env.example to .env first")
    out = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            out[key] = value
    return out


def write_env(updates: dict):
    """Rewrites .env with `updates` applied, keeping comments and order.

    Variables the file does not carry yet are appended.
    """
    lines = ENV_PATH.read_text().splitlines()
    pending = dict(updates)
    for i, line in enumerate(lines):
        key = line.partition("=")[0].strip()
        if key in pending and not line.lstrip().startswith("#"):
            lines[i] = f"{key}={pending.pop(key)}"
    lines += [f"{key}={value}" for key, value in pending.items()]
    ENV_PATH.write_text("\n".join(lines) + "\n")


def value(key, conf=None) -> int:
    """One port from .env.

    Raises:
        RuntimeError: The variable is missing or is not a port number.
    """
    raw = (conf if conf is not None else read_env()).get(key)
    if raw is None:
        raise RuntimeError(f"{key} is not set in .env (see .env.example)")
    try:
        port = int(raw)
    except ValueError:
        raise RuntimeError(f"{key}={raw!r} in .env is not a port number") from None
    if not MIN_PORT <= port <= MAX_PORT:
        raise RuntimeError(f"{key}={port} in .env is outside {MIN_PORT}-{MAX_PORT}")
    return port


def in_use(port: int) -> bool:
    """True when something on the host already accepts connections on `port`."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _live_ports() -> dict:
    """Host ports each compose service currently publishes, keyed by service."""
    from stack import compose_ps  # local import to avoid a cycle

    live = {}
    for svc, container in compose_ps().items():
        if container.get("state") != "running":
            continue
        live[svc] = sorted(
            {
                p["PublishedPort"]
                for p in container.get("publishers") or []
                if p.get("PublishedPort")
            }
        )
    return live


def listing() -> dict:
    """Configured ports, what the running stack publishes, and where they differ.

    A port is `pending` when its service runs with a different set of
    published ports than .env now asks for, i.e. the stack has to be recreated.
    """
    conf = read_env()
    live = _live_ports()

    entries, wanted = [], {}
    for spec in PORTS:
        entry = dict(spec)
        entry.setdefault("url", None)
        try:
            entry["value"] = value(spec["key"], conf)
            wanted.setdefault(spec["service"], []).append(entry["value"])
        except RuntimeError as exc:
            entry["value"] = None
            entry["error"] = str(exc)
        entries.append(entry)

    for entry in entries:
        svc = entry["service"]
        published = live.get(svc)
        entry["live"] = published
        entry["running"] = published is not None
        entry["pending"] = published is not None and sorted(wanted.get(svc, [])) != published
        entry["inUse"] = entry["value"] is not None and in_use(entry["value"])

    return {"ok": True, "ports": entries}


def apply(updates: dict) -> dict:
    """Validates port assignments and writes the changed ones to .env.

    Returns the same payload as `listing`, plus what changed and which
    restart each change needs. Ports are rejected rather than written when a
    value is out of range, collides with another component, or is already
    taken on the host; variables .env is missing are added.
    """
    conf = read_env()
    final, changed = {}, []

    for key in updates:
        if key not in KEYS:
            return {"ok": False, "error": f"{key} is not a port of this stack"}

    for spec in PORTS:
        key = spec["key"]
        if key not in updates:
            # A variable .env does not carry yet is left out rather than
            # failing the write: it is what this call is here to add.
            if key in conf:
                final[key] = value(key, conf)
            continue
        try:
            port = int(str(updates[key]).strip())
        except ValueError:
            return {"ok": False, "error": f"{key}: {updates[key]!r} is not a number"}
        if not MIN_PORT <= port <= MAX_PORT:
            return {"ok": False, "error": f"{key}: {port} is outside {MIN_PORT}-{MAX_PORT}"}
        final[key] = port
        before = value(key, conf) if key in conf else None
        if port != before:
            changed.append({"key": key, "from": before, "to": port,
                            "applies": spec["applies"]})

    for key, port in final.items():
        clash = [k for k, p in final.items() if p == port and k != key]
        if clash:
            return {"ok": False, "error": f"{key} and {clash[0]} would both use {port}"}

    live = _live_ports()
    for change in changed:
        spec = next(s for s in PORTS if s["key"] == change["key"])
        # Three ports are ours, not a conflict: one the stack already
        # publishes for this very service (the recreate frees it), one being
        # written down for the first time (nothing moves), and the console's,
        # which is served by the process asking the question.
        if (
            change["to"] in (live.get(spec["service"]) or [])
            or change["from"] is None
            or spec["applies"] == "console"
        ):
            continue
        if in_use(change["to"]):
            return {
                "ok": False,
                "error": f"port {change['to']} is already in use on this host",
            }

    write_env({c["key"]: c["to"] for c in changed})
    return {
        **listing(),
        "changed": changed,
        "restart": sorted({c["applies"] for c in changed}),
    }
