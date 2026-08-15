#!/bin/bash
# Bootstraps Lakekeeper and creates the warehouse backed by MinIO. Idempotent:
# bootstrap failures after the first run are expected, and the warehouse is
# only created if absent.
set -euo pipefail

LAKEKEEPER=http://lakekeeper:8181
PROJECT_ID=00000000-0000-0000-0000-000000000000

# Bootstrap can only ever succeed once; ignore "already bootstrapped".
code=$(curl -s -o /tmp/bootstrap.out -w '%{http_code}' -X POST \
    "$LAKEKEEPER/management/v1/bootstrap" \
    -H 'Content-Type: application/json' \
    --data '{"accept-terms-of-use": true}')
case "$code" in
2*) echo "lakekeeper-init: bootstrapped" ;;
*) echo "lakekeeper-init: bootstrap skipped (HTTP $code): $(cat /tmp/bootstrap.out)" ;;
esac

if curl -fsS "$LAKEKEEPER/management/v1/warehouse?project-id=$PROJECT_ID" |
    grep -q "\"name\":\"$LAKEHOUSE_WAREHOUSE\""; then
    echo "lakekeeper-init: warehouse '$LAKEHOUSE_WAREHOUSE' already exists"
    exit 0
fi

curl -fsS -X POST "$LAKEKEEPER/management/v1/warehouse" \
    -H 'Content-Type: application/json' \
    --data @- <<EOF
{
  "warehouse-name": "$LAKEHOUSE_WAREHOUSE",
  "project-id": "$PROJECT_ID",
  "storage-profile": {
    "type": "s3",
    "bucket": "$LAKEHOUSE_BUCKET",
    "key-prefix": "warehouse",
    "endpoint": "http://minio:9000",
    "region": "local-01",
    "path-style-access": true,
    "flavor": "s3-compat",
    "sts-enabled": true
  },
  "storage-credential": {
    "type": "s3",
    "credential-type": "access-key",
    "access-key-id": "$LAKEHOUSE_S3_ACCESS_KEY",
    "secret-access-key": "$LAKEHOUSE_S3_SECRET_KEY"
  },
  "delete-profile": { "type": "hard" }
}
EOF
echo
echo "lakekeeper-init: warehouse '$LAKEHOUSE_WAREHOUSE' created"
