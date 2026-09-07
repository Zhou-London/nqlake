"""The interaction layer: every call into the catalog, storage, and DuckDB lives here.

PyIceberg manages tables and their rows: namespaces, creation, schema,
properties, appends, deletes, scans. DuckDB answers ad-hoc SQL over the same
REST catalog, read-only.
"""

# Every table this backend creates uses the v2 spec. PyIceberg 0.12 writes
# v1 and v2 manifests only, so v3 tables could be created but never filled.
FORMAT_VERSION = 2
