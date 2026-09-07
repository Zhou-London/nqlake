"""Maps ``nqlake.errors`` to HTTP responses with one JSON shape (``ErrorOut``)."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from nqlake.errors import AlreadyExists, Incompatible, InvalidRequest, LakeError, NotFound, Unavailable

_STATUS = {
    NotFound: 404,
    AlreadyExists: 409,
    Incompatible: 422,
    InvalidRequest: 422,
    Unavailable: 503,
}


def _status_of(exc: LakeError) -> int:
    for cls, status in _STATUS.items():
        if isinstance(exc, cls):
            return status
    return 500


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(LakeError)
    def lake_error(_: Request, exc: LakeError) -> JSONResponse:
        problems = exc.problems if isinstance(exc, Incompatible) else []
        return JSONResponse(status_code=_status_of(exc), content={"error": str(exc), "problems": problems})
