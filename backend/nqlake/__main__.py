"""Serves the API: ``python -m nqlake`` (the Makefile's ``make api``)."""

import uvicorn

from nqlake.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    uvicorn.run("nqlake.api.app:create_app", factory=True, host="127.0.0.1", port=settings.api_port)
