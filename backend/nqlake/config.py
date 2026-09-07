"""Settings of the backend, read from the environment with ``.env`` as the fallback.

The compose stack and the backend read the same ``.env``, so a port changed
there moves both sides at once.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# backend/nqlake/config.py -> the repository root.
ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    host: str
    lakekeeper_port: int
    minio_api_port: int
    postgres_port: int
    warehouse: str
    bucket: str
    api_port: int
    duckdb_extension_dir: Path
    # MinIO user of the stack; empty when .env does not set it.
    s3_access_key: str
    s3_secret_key: str

    @property
    def lakekeeper_url(self) -> str:
        return f"http://{self.host}:{self.lakekeeper_port}"

    @property
    def catalog_uri(self) -> str:
        return f"{self.lakekeeper_url}/catalog"

    @property
    def minio_url(self) -> str:
        return f"http://{self.host}:{self.minio_api_port}"


def read_dotenv(path: Path) -> dict[str, str]:
    """Parses ``KEY=VALUE`` lines of a dotenv file. Returns {} when the file is missing."""
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def load_settings(dotenv: Path = ROOT / ".env") -> Settings:
    """Builds Settings. A process environment variable wins over the same key in ``.env``."""
    env = {**read_dotenv(dotenv), **os.environ}

    def get(key: str, default: str) -> str:
        return env.get(key, default)

    return Settings(
        host=get("LAKEHOUSE_HOST", "localhost"),
        lakekeeper_port=int(get("LAKEKEEPER_PORT", "40002")),
        minio_api_port=int(get("MINIO_API_PORT", "40000")),
        postgres_port=int(get("POSTGRES_PORT", "40003")),
        warehouse=get("LAKEHOUSE_WAREHOUSE", "lakehouse"),
        bucket=get("LAKEHOUSE_BUCKET", "lakehouse"),
        api_port=int(get("API_PORT", "40004")),
        duckdb_extension_dir=Path(get("DUCKDB_EXTENSION_DIR", str(ROOT / "images/duckdb/extensions"))),
        s3_access_key=get("LAKEHOUSE_S3_ACCESS_KEY", ""),
        s3_secret_key=get("LAKEHOUSE_S3_SECRET_KEY", ""),
    )
