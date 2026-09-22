"""Serves the API: ``python -m nqlake`` (the Makefile's ``make api``)."""

import logging

import uvicorn

from nqlake.config import load_settings

if __name__ == "__main__":
    # The backend's own loggers (transfers over the Arrow socket) print next
    # to uvicorn's access log; uvicorn keeps its own handlers.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
    settings = load_settings()
    uvicorn.run("nqlake.api.app:create_app", factory=True, host="127.0.0.1", port=settings.api_port)
