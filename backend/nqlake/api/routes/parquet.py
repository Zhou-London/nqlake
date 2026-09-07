import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from nqlake.api.schemas import InspectOut
from nqlake.lake import parquet

router = APIRouter(prefix="/parquet", tags=["parquet"])


@router.post("/inspect", response_model=InspectOut, summary="Check a Parquet file without writing it")
def inspect_parquet(
    file: UploadFile = File(..., description="A Parquet file."),
) -> InspectOut:
    """Reports the Iceberg type of each column and the repairs an upload would apply.

    A file the upload would reject gets the same 422 answer here.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "upload.parquet"
        with path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        prepared = parquet.prepare(parquet.read_parquet(path))
    return InspectOut(rows=prepared.data.num_rows, columns=prepared.columns, repairs=prepared.repairs)
