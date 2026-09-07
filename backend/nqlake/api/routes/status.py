from fastapi import APIRouter, Depends
from pyiceberg.catalog.rest import RestCatalog

from nqlake.api.deps import get_catalog, get_duckdb, get_settings
from nqlake.api.schemas import StatusOut
from nqlake.config import Settings
from nqlake.lake import status
from nqlake.lake.query import Engine

router = APIRouter(tags=["status"])


@router.get("/status", response_model=StatusOut, summary="Health of every service")
def get_status(
    settings: Settings = Depends(get_settings),
    catalog: RestCatalog = Depends(get_catalog),
    engine: Engine = Depends(get_duckdb),
) -> StatusOut:
    return StatusOut.model_validate(status.check_all(catalog, engine, settings))
