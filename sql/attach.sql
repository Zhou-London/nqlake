-- Attaches the lakehouse catalog. Loaded automatically by the duckdb compose
-- service (`duckdb -init`). The catalog runs without auth, and Lakekeeper
-- vends short-lived MinIO credentials per table, so no S3 secret is needed.
--
-- The attached name must match LAKEHOUSE_WAREHOUSE in .env.
LOAD httpfs;
LOAD iceberg;

ATTACH 'lakehouse' AS lake (
    TYPE iceberg,
    ENDPOINT 'http://lakekeeper:8181/catalog',
    AUTHORIZATION_TYPE 'none'
);
