"""NQ Lake backend.

Two layers, kept apart on purpose:

- ``nqlake.lake`` talks to the systems: the Iceberg REST catalog through
  PyIceberg, object storage through PyIceberg's FileIO, and DuckDB for SQL.
  The package raises ``nqlake.errors`` exceptions and never imports FastAPI.
- ``nqlake.api`` is the HTTP surface: FastAPI routes, request and response
  models, and the mapping from ``nqlake.errors`` to status codes. The package
  holds no Iceberg logic.
"""
