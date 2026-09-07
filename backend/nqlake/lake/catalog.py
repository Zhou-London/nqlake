"""Opens the REST catalog and translates PyIceberg's errors into ``nqlake.errors``."""

from __future__ import annotations

import re
from collections.abc import Iterator
from contextlib import contextmanager

import requests
from pyiceberg.catalog.rest import RestCatalog
from pyiceberg.exceptions import (
    NamespaceAlreadyExistsError,
    NamespaceNotEmptyError,
    NoSuchNamespaceError,
    NoSuchTableError,
    TableAlreadyExistsError,
)

from nqlake.config import Settings
from nqlake.errors import AlreadyExists, InvalidRequest, NotFound, Unavailable

# One catalog name for the process; PyIceberg uses it only in error messages.
CATALOG_NAME = "nqlake"

# One level of a namespace, or a table name: letters, digits, underscore.
_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def open_catalog(settings: Settings) -> RestCatalog:
    """Connects to Lakekeeper. Storage credentials arrive vended per table, so none are configured here."""
    return RestCatalog(CATALOG_NAME, uri=settings.catalog_uri, warehouse=settings.warehouse)


def namespace_tuple(namespace: str) -> tuple[str, ...]:
    """Splits ``a.b`` into the catalog's namespace levels. Rejects empty or malformed levels."""
    levels = tuple(namespace.split("."))
    for level in levels:
        if not _NAME.match(level):
            raise InvalidRequest(
                f"Namespace {namespace!r} is malformed. Each dot-separated level needs letters, digits, "
                "or underscores and cannot start with a digit."
            )
    return levels


def table_identifier(namespace: str, table: str) -> tuple[str, ...]:
    """Builds the catalog identifier of ``namespace.table``. Rejects malformed names."""
    if not _NAME.match(table):
        raise InvalidRequest(
            f"Table name {table!r} is malformed. Use letters, digits, or underscores, not starting with a digit."
        )
    return (*namespace_tuple(namespace), table)


@contextmanager
def catalog_errors(subject: str) -> Iterator[None]:
    """Turns PyIceberg and transport errors into ``nqlake.errors`` for the block inside.

    ``subject`` names what the block acts on, e.g. ``table raw.trades``, and
    opens the message of a not-found or already-exists error.
    """
    try:
        yield
    except NoSuchTableError as exc:
        raise NotFound(f"{subject} does not exist.") from exc
    except NoSuchNamespaceError as exc:
        raise NotFound(f"{subject} does not exist, or its namespace does not.") from exc
    except (TableAlreadyExistsError, NamespaceAlreadyExistsError) as exc:
        raise AlreadyExists(f"{subject} already exists.") from exc
    except NamespaceNotEmptyError as exc:
        raise InvalidRequest(f"{subject} still holds tables; drop them first.") from exc
    except requests.ConnectionError as exc:
        raise Unavailable(f"The catalog did not answer: {exc}") from exc
