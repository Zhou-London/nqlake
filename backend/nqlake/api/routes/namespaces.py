from fastapi import APIRouter, Depends, Response, status
from pyiceberg.catalog.rest import RestCatalog

from nqlake.api.deps import get_catalog
from nqlake.api.schemas import NamespaceIn, TableIn, TableOut
from nqlake.lake import tables
from nqlake.lake.tables import ColumnSpec

router = APIRouter(prefix="/namespaces", tags=["namespaces"])


@router.get("", summary="List namespaces")
def list_namespaces(catalog: RestCatalog = Depends(get_catalog)) -> list[str]:
    return tables.list_namespaces(catalog)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a namespace")
def create_namespace(body: NamespaceIn, catalog: RestCatalog = Depends(get_catalog)) -> dict[str, str]:
    tables.create_namespace(catalog, body.name)
    return {"namespace": body.name}


@router.delete("/{namespace}", status_code=status.HTTP_204_NO_CONTENT, summary="Drop an empty namespace")
def drop_namespace(namespace: str, catalog: RestCatalog = Depends(get_catalog)) -> Response:
    tables.drop_namespace(catalog, namespace)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{namespace}/tables", summary="List the tables of a namespace")
def list_tables(namespace: str, catalog: RestCatalog = Depends(get_catalog)) -> list[str]:
    return tables.list_tables(catalog, namespace)


@router.post(
    "/{namespace}/tables",
    response_model=TableOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an empty v3 table",
)
def create_table(namespace: str, body: TableIn, catalog: RestCatalog = Depends(get_catalog)) -> TableOut:
    columns = [ColumnSpec(c.name, c.type, c.required, c.doc) for c in body.columns]
    table = tables.create_table(catalog, namespace, body.name, columns, body.partition_by, body.properties)
    return TableOut.model_validate(tables.describe(table))
