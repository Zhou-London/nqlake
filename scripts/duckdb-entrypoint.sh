#!/bin/bash
# Entrypoint of every DuckDB container in the stack. Renders
# sql/attach.sql.template into /tmp/attach.sql with this stack's warehouse and
# catalog endpoint, then runs the container's command. The mounted sql/
# directory is read-only, which is why the rendered file lands in /tmp.
set -euo pipefail

sed -e "s|@WAREHOUSE@|${LAKEHOUSE_WAREHOUSE}|g" \
    -e "s|@CATALOG_ENDPOINT@|http://lakekeeper:${LAKEKEEPER_PORT}/catalog|g" \
    /opt/lakehouse/sql/attach.sql.template >/tmp/attach.sql

exec "$@"
