#!/bin/bash
# End-to-end check: create an Iceberg table through Lakekeeper, write rows
# (Parquet lands in MinIO via vended credentials), read them back, drop the
# table. Fails loudly on any mismatch.
set -euo pipefail

result=$(duckdb -init /opt/lakehouse/sql/attach.sql -noheader -list -c "
CREATE SCHEMA IF NOT EXISTS lake.smoke;
DROP TABLE IF EXISTS lake.smoke.trades;
CREATE TABLE lake.smoke.trades (ts TIMESTAMP, sym VARCHAR, px DOUBLE, qty BIGINT);
INSERT INTO lake.smoke.trades VALUES
    (TIMESTAMP '2026-08-15 10:00:00', 'AAPL', 231.50, 100),
    (TIMESTAMP '2026-08-15 10:00:01', 'AAPL', 231.55, 50),
    (TIMESTAMP '2026-08-15 10:00:02', 'MSFT', 511.10, 200);
SELECT count(*), round(sum(px * qty), 2) FROM lake.smoke.trades;
")

echo "smoke-test: got [$result]"
if [[ "$result" != "3|136947.5" ]]; then
    echo "smoke-test: FAILED (expected [3|136947.5])" >&2
    exit 1
fi

duckdb -init /opt/lakehouse/sql/attach.sql -c "DROP TABLE lake.smoke.trades;"
echo "smoke-test: OK"
