"""Stack-level access for the NQ Lake tooling.

Wraps `docker compose`, Lakekeeper's HTTP APIs, and the bind mounts in
images/. Every public function returns a JSON-serializable dict with an "ok"
key; nqlake.py decides how to render it.
"""

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import ports

ROOT = ports.ROOT
PROJECT_ID = "00000000-0000-0000-0000-000000000000"

# Long-running services `ops` may control, and the one-shot jobs `status`
# reports alongside them.
SERVICES = ("minio", "postgres", "lakekeeper")
ONESHOTS = ("minio-init", "lakekeeper-migrate", "lakekeeper-init")

env = ports.read_env

# Everything this backend calls over HTTP is this stack: the catalog on
# localhost, MinIO at the name the catalog vends. An HTTP proxy in the
# environment must not see those requests, so the stack's names are added to
# NO_PROXY for every client in this process: urllib here, requests and
# pyarrow's S3 client under PyIceberg in data.py.
for _key in ("NO_PROXY", "no_proxy"):
    os.environ[_key] = ",".join(filter(None, [os.environ.get(_key), "localhost,127.0.0.1,minio,lakekeeper"]))


def lakekeeper_url(conf=None) -> str:
    """Base URL of Lakekeeper on the host, on its configured port."""
    return f"http://localhost:{ports.value('LAKEKEEPER_PORT', conf)}"


def sh(args, timeout=30, check=False):
    """Runs a command from the stack root; returns (rc, stdout, stderr)."""
    proc = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if check and proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.returncode, proc.stdout, proc.stderr


def compose(*args, timeout=60, check=False):
    return sh(["docker", "compose", *args], timeout=timeout, check=check)


def http(url, method="GET", body=None, timeout=5):
    """Calls a JSON endpoint; returns the decoded body, or raises HTTPError.

    An empty 2xx body decodes to {}. Connection failures come back as None so
    callers can treat "down" and "not found" the same way when they want to.
    """
    req = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def get(url, timeout=5):
    """GET a JSON endpoint; None on any failure, HTTP errors included."""
    try:
        return http(url, timeout=timeout)
    except urllib.error.HTTPError:
        return None


def _json_lines(text):
    for line in text.splitlines():
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def compose_ps() -> dict:
    """Container states keyed by compose service name."""
    _, out, _ = compose("ps", "-a", "--format", "json")
    return {
        row.get("Service"): {
            "state": row.get("State"),
            "health": row.get("Health") or None,
            "status": row.get("Status"),
            "exitCode": row.get("ExitCode"),
            "id": row.get("ID"),
            "publishers": row.get("Publishers") or [],
        }
        for row in _json_lines(out)
    }


def status():
    conf = env()
    ps = compose_ps()
    lakekeeper = lakekeeper_url(conf)

    info = get(f"{lakekeeper}/management/v1/info")
    health = get(f"{lakekeeper}/health") or {}
    listing = get(f"{lakekeeper}/management/v1/warehouse?project-id={PROJECT_ID}") or {}
    warehouse = next(iter(listing.get("warehouses", [])), None)
    # Lakekeeper's Postgres pool health proves the catalog <-> metadata-DB
    # link, not just that both processes are up.
    pools = health.get("services", {}).get("catalog", [])

    absent = {"state": "absent", "health": None, "status": None, "exitCode": None}
    components = {
        svc: {**(ps.get(svc) or absent), "oneshot": svc in ONESHOTS}
        for svc in SERVICES + ONESHOTS
    }
    for c in components.values():
        c.pop("id", None)
        c.pop("publishers", None)

    return {
        "ok": True,
        "components": components,
        "catalog": {
            "reachable": info is not None,
            "version": (info or {}).get("version"),
            "bootstrapped": (info or {}).get("bootstrapped"),
            "dbOk": bool(pools) and all(p.get("status") == "ok" for p in pools),
        },
        "warehouse": warehouse and {"name": warehouse["name"], "status": warehouse["status"]},
    }


def _du(path: Path) -> int:
    """Total bytes of the files under `path`; 0 when it does not exist."""
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file()) if path.exists() else 0


def _size(text) -> int:
    """Parses docker-stats sizes like '22.74MiB' into bytes."""
    m = re.match(r"([\d.]+)\s*([KMGT]?i?B)", text or "")
    if not m:
        return 0
    units = {"B": 1, "KB": 1e3, "MB": 1e6, "GB": 1e9, "TB": 1e12,
             "KiB": 2**10, "MiB": 2**20, "GiB": 2**30, "TiB": 2**40}
    return int(float(m.group(1)) * units.get(m.group(2), 1))


def stats():
    """Per-container CPU/memory/IO and the size of each service's data on disk."""
    conf = env()
    # docker stats reports 12-character ids; compose ps gives the full one.
    running = {v["id"][:12]: k for k, v in compose_ps().items() if v["state"] == "running"}

    containers = {}
    if running:
        _, out, _ = sh(["docker", "stats", "--no-stream", "--format", "json", *running], timeout=20)
        for row in _json_lines(out):
            svc = running.get((row.get("ID") or "")[:12])
            if not svc:
                continue
            used, _, limit = (row.get("MemUsage") or "").partition(" / ")
            containers[svc] = {
                "cpuPercent": float((row.get("CPUPerc") or "0%").rstrip("%") or 0),
                "memBytes": _size(used),
                "memLimitBytes": _size(limit),
                "netIO": row.get("NetIO"),
                "blockIO": row.get("BlockIO"),
                "pids": int(row.get("PIDs") or 0),
            }

    images = ROOT / "images"
    return {
        "ok": True,
        "containers": containers,
        "storage": {
            "bucket": _du(images / "minio" / "data" / conf.get("LAKEHOUSE_BUCKET", "lakehouse")),
            "postgres": _du(images / "postgres" / "data"),
            "duckdb": _du(images / "duckdb" / "work"),
        },
    }


def ops(action, service=None):
    """Runs one administrative action through compose."""
    started = time.time()
    detail = None
    try:
        if action in ("start", "stop", "restart"):
            if service not in SERVICES:
                return {"ok": False, "error": f"service must be one of {SERVICES}"}
            compose(action, service, timeout=120, check=True)
        elif action == "stack-up":
            compose("up", "-d", timeout=300, check=True)
        elif action == "stack-stop":
            compose("stop", timeout=120, check=True)
        else:
            return {"ok": False, "error": f"unknown action {action!r}"}
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": str(exc), "elapsedMs": int((time.time() - started) * 1000)}
    return {
        "ok": True,
        "action": action,
        "service": service,
        "detail": detail,
        "elapsedMs": int((time.time() - started) * 1000),
    }


def logs(service, tail=200):
    if service not in SERVICES + ONESHOTS:
        return {"ok": False, "error": "unknown service"}
    rc, out, err = compose("logs", "--no-color", "--tail", str(tail), service, timeout=20)
    if rc != 0:
        return {"ok": False, "error": err.strip()}
    # Strip the "name-1  | " prefix compose adds to every line.
    lines = [re.sub(r"^\S+\s+\|\s?", "", l) for l in out.splitlines()]
    return {"ok": True, "service": service, "lines": lines}
