"""Stack-level access for the NQ Lake tooling.

Wraps `docker compose`, the service HTTP APIs, and the bind mounts in
images/. Every public function returns a JSON-serializable dict with an "ok"
key; entrypoints decide how to render it.
"""

import json
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAKEKEEPER = "http://localhost:8181"
MINIO = "http://localhost:9000"
PROJECT_ID = "00000000-0000-0000-0000-000000000000"
STATE_DIR = ROOT / "images" / "console" / "state"

# Long-running services `ops` may control, and one-shot jobs reported by
# `status`.
SERVICES = ("minio", "postgres", "lakekeeper")
ONESHOTS = ("minio-init", "lakekeeper-migrate", "lakekeeper-init")


def env() -> dict:
    """Parses KEY=VALUE pairs from the stack's .env file."""
    out = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            out[key] = value
    return out


def sh(args, timeout=30, check=False):
    """Runs a command from the stack root; returns (rc, stdout, stderr)."""
    proc = subprocess.run(
        args, cwd=ROOT, capture_output=True, text=True, timeout=timeout
    )
    if check and proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.returncode, proc.stdout, proc.stderr


def compose(*args, timeout=60, check=False):
    return sh(["docker", "compose", *args], timeout=timeout, check=check)


def http_json(url, body=None, timeout=5):
    """GET (or POST when `body` is given) a JSON endpoint; None on failure."""
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def http_ok(url, timeout=3):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def compose_ps() -> dict:
    """Container states keyed by compose service name."""
    _, out, _ = compose("ps", "-a", "--format", "json")
    services = {}
    for line in out.splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        services[row.get("Service")] = {
            "state": row.get("State"),
            "health": row.get("Health") or None,
            "status": row.get("Status"),
            "exitCode": row.get("ExitCode"),
            "id": row.get("ID"),
            "name": row.get("Name"),
        }
    return services


def read_state(name):
    try:
        return json.loads((STATE_DIR / f"{name}.json").read_text())
    except (OSError, json.JSONDecodeError):
        return None


def write_state(name, value):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    (STATE_DIR / f"{name}.json").write_text(json.dumps(value))


def status():
    conf = env()
    ps = compose_ps()

    info = http_json(f"{LAKEKEEPER}/management/v1/info")
    health = http_json(f"{LAKEKEEPER}/health")
    warehouses = http_json(
        f"{LAKEKEEPER}/management/v1/warehouse?project-id={PROJECT_ID}"
    )
    warehouse = (warehouses or {}).get("warehouses", [None])[0] if warehouses else None
    minio_live = http_ok(f"{MINIO}/minio/health/live")

    rc, _, _ = compose(
        "exec", "-T", "postgres", "pg_isready",
        "-U", conf.get("POSTGRES_USER", "postgres"),
        "-d", conf.get("POSTGRES_DB", "postgres"),
        timeout=10,
    )

    components = {}
    for svc in SERVICES + ONESHOTS:
        entry = ps.get(svc) or {"state": "absent", "health": None, "status": None}
        entry["oneshot"] = svc in ONESHOTS
        components[svc] = entry
    components["minio"]["api"] = minio_live
    components["postgres"]["api"] = rc == 0
    components["lakekeeper"]["api"] = info is not None
    components["lakekeeper"]["version"] = (info or {}).get("version")
    components["lakekeeper"]["bootstrapped"] = (info or {}).get("bootstrapped")

    # Pool health of Lakekeeper's Postgres connections proves the
    # catalog <-> metadata-DB link, not just the two processes.
    pools = (health or {}).get("services", {}).get("catalog", [])
    lk_pg = bool(pools) and all(p.get("status") == "ok" for p in pools)
    smoke = read_state("smoke")

    links = {
        "lakekeeper-postgres": {"ok": lk_pg},
        "lakekeeper-minio": {
            "ok": bool(warehouse) and warehouse.get("status") == "active",
            "warehouse": (warehouse or {}).get("name"),
        },
        # DuckDB is a run-on-demand client; the last smoke test is the
        # evidence for the full write/read path.
        "duckdb-stack": {
            "ok": bool(smoke and smoke.get("ok")),
            "at": (smoke or {}).get("at"),
            "detail": (smoke or {}).get("detail"),
        },
    }

    return {
        "ok": True,
        "components": components,
        "links": links,
        "server": info,
        "warehouse": warehouse,
    }


def _dir_stats(path: Path, minio_layout=False):
    """Total bytes and file count under `path`, plus Parquet-only figures.

    With `minio_layout`, each object is a directory holding `xl.meta` (and
    data parts), so objects and Parquet files are counted by directory name.
    """
    total = files = objects = pq_total = pq_count = 0
    if path.exists():
        for p in path.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
                files += 1
            is_object = (
                p.is_dir() and (p / "xl.meta").exists()
                if minio_layout
                else p.is_file()
            )
            if is_object:
                objects += 1
                if p.suffix == ".parquet":
                    pq_count += 1
                    pq_total += (
                        sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
                        if p.is_dir()
                        else p.stat().st_size
                    )
    return {
        "bytes": total,
        "files": objects,
        "parquetBytes": pq_total,
        "parquetFiles": pq_count,
    }


def _parse_size(text):
    """Parses docker-stats sizes like '22.74MiB' into bytes."""
    m = re.match(r"([\d.]+)\s*([KMGT]?i?B)", text or "")
    if not m:
        return 0
    units = {"B": 1, "KB": 1e3, "MB": 1e6, "GB": 1e9, "TB": 1e12,
             "KiB": 2**10, "MiB": 2**20, "GiB": 2**30, "TiB": 2**40}
    return int(float(m.group(1)) * units.get(m.group(2), 1))


def stats():
    from data import table_count  # local import to avoid a cycle

    conf = env()
    ps = compose_ps()
    running = {v["id"]: k for k, v in ps.items() if v.get("state") == "running"}

    containers = {}
    if running:
        _, out, _ = sh(
            ["docker", "stats", "--no-stream", "--format", "json", *running],
            timeout=20,
        )
        for line in out.splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            svc = running.get(row.get("ID")) or running.get(row.get("ID", "")[:12])
            if not svc:
                continue
            mem_used, _, mem_limit = (row.get("MemUsage") or "").partition(" / ")
            containers[svc] = {
                "cpuPercent": float((row.get("CPUPerc") or "0%").rstrip("%") or 0),
                "memBytes": _parse_size(mem_used),
                "memLimitBytes": _parse_size(mem_limit),
                "netIO": row.get("NetIO"),
                "blockIO": row.get("BlockIO"),
                "pids": int(row.get("PIDs") or 0),
            }

    bucket = conf.get("LAKEHOUSE_BUCKET", "lakehouse")
    storage = {
        "bucket": {"name": bucket,
                   **_dir_stats(ROOT / "images" / "minio" / "data" / bucket,
                                minio_layout=True)},
        "postgres": _dir_stats(ROOT / "images" / "postgres" / "data"),
        "duckdb": _dir_stats(ROOT / "images" / "duckdb" / "work"),
    }

    warehouse_stats = None
    warehouses = http_json(
        f"{LAKEKEEPER}/management/v1/warehouse?project-id={PROJECT_ID}"
    )
    if warehouses and warehouses.get("warehouses"):
        wid = warehouses["warehouses"][0]["id"]
        raw = http_json(f"{LAKEKEEPER}/management/v1/warehouse/{wid}/statistics")
        if raw:
            warehouse_stats = [
                {
                    "timestamp": s["timestamp"],
                    "tables": s["number-of-tables"],
                    "views": s["number-of-views"],
                }
                for s in raw.get("stats", [])
            ]

    api = http_json(
        f"{LAKEKEEPER}/management/v1/endpoint-statistics",
        body={"warehouse": {"type": "all"}},
    )
    api_series, api_routes = [], {}
    if api:
        for ts, entries in zip(api.get("timestamps", []),
                               api.get("called-endpoints", [])):
            total = errors = 0
            for e in entries:
                total += e["count"]
                if e.get("status-code", 200) >= 400:
                    errors += e["count"]
                key = e["http-route"]
                api_routes[key] = api_routes.get(key, 0) + e["count"]
            api_series.append({"timestamp": ts, "calls": total, "errors": errors})
        api_series.sort(key=lambda s: s["timestamp"])

    return {
        "ok": True,
        "containers": containers,
        "storage": storage,
        "tableCount": table_count(),
        "warehouseStats": warehouse_stats,
        "apiSeries": api_series,
        "apiRoutes": sorted(
            ({"route": k, "count": v} for k, v in api_routes.items()),
            key=lambda r: -r["count"],
        )[:10],
    }


def ops(action, service=None):
    if action in ("start", "stop", "restart"):
        if service not in SERVICES:
            return {"ok": False, "error": f"service must be one of {SERVICES}"}
        try:
            compose(action, service, timeout=120, check=True)
        except RuntimeError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "action": action, "service": service}

    if action == "stack-up":
        try:
            compose("up", "-d", timeout=300, check=True)
        except RuntimeError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "action": action}

    if action == "stack-stop":
        try:
            compose("stop", timeout=120, check=True)
        except RuntimeError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "action": action}

    if action == "smoke":
        started = time.time()
        try:
            rc, out, err = compose("run", "--rm", "-T", "smoke-test", timeout=180)
        except subprocess.TimeoutExpired:
            rc, out, err = 1, "", "smoke test timed out"
        text = re.sub(r"\x1b\[[0-9;]*m", "", out + err)
        lines = [l for l in text.splitlines() if l.startswith("smoke-test:")]
        detail = "\n".join(lines or text.splitlines()[-6:])
        result = {
            "ok": rc == 0,
            "at": int(time.time() * 1000),
            "elapsedMs": int((time.time() - started) * 1000),
            "detail": detail,
        }
        write_state("smoke", result)
        return {"ok": True, "action": action, "result": result}

    return {"ok": False, "error": f"unknown action {action!r}"}


def logs(service, tail=200):
    if service not in SERVICES + ONESHOTS:
        return {"ok": False, "error": "unknown service"}
    rc, out, err = compose(
        "logs", "--no-color", "--tail", str(tail), service, timeout=20
    )
    if rc != 0:
        return {"ok": False, "error": err.strip()}
    # Strip the "name-1  | " prefix compose adds to every line.
    lines = [re.sub(r"^\S+\s+\|\s?", "", l) for l in out.splitlines()]
    return {"ok": True, "service": service, "lines": lines}
