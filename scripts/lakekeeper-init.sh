#!/bin/bash
# Bootstraps Lakekeeper and creates the warehouse backed by MinIO. Idempotent:
# bootstrap failures after the first run are expected, the warehouse is only
# created when absent, and an existing warehouse is repointed when MinIO's
# port has moved under it.
set -euo pipefail

LAKEKEEPER=http://lakekeeper:$LAKEKEEPER_PORT
MINIO=http://minio:$MINIO_API_PORT
PROJECT_ID=00000000-0000-0000-0000-000000000000

# Where the warehouse's data lives and the key it is reached with. Both the
# create and the update call take exactly this object.
storage() {
    cat <<JSON
{
  "storage-profile": {
    "type": "s3",
    "bucket": "$LAKEHOUSE_BUCKET",
    "key-prefix": "warehouse",
    "endpoint": "$MINIO",
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
  }
}
JSON
}

# Bootstrap can only ever succeed once; ignore "already bootstrapped".
code=$(curl -s -o /tmp/bootstrap.out -w '%{http_code}' -X POST \
    "$LAKEKEEPER/management/v1/bootstrap" \
    -H 'Content-Type: application/json' \
    --data '{"accept-terms-of-use": true}')
case "$code" in
2*) echo "lakekeeper-init: bootstrapped" ;;
*) echo "lakekeeper-init: bootstrap skipped (HTTP $code): $(cat /tmp/bootstrap.out)" ;;
esac

warehouse=$(curl -fsS "$LAKEKEEPER/management/v1/warehouse?project-id=$PROJECT_ID" |
    jq -c --arg name "$LAKEHOUSE_WAREHOUSE" \
        'first(.warehouses[] | select(.name == $name)) // empty')

if [ -z "$warehouse" ]; then
    storage |
        jq --arg name "$LAKEHOUSE_WAREHOUSE" --arg project "$PROJECT_ID" \
            '. + {"warehouse-name": $name, "project-id": $project,
                  "delete-profile": {"type": "hard"}}' |
        curl -fsS -X POST "$LAKEKEEPER/management/v1/warehouse" \
            -H 'Content-Type: application/json' --data @- >/dev/null
    echo "lakekeeper-init: warehouse '$LAKEHOUSE_WAREHOUSE' created on $MINIO"
    exit 0
fi

# The endpoint is stored with the warehouse, so a MinIO port change has to be
# written back or every vended credential points at a dead address.
endpoint=$(jq -r '."storage-profile".endpoint' <<<"$warehouse")
if [ "${endpoint%/}" = "$MINIO" ]; then
    echo "lakekeeper-init: warehouse '$LAKEHOUSE_WAREHOUSE' already on $MINIO"
    exit 0
fi

storage | curl -fsS -X POST \
    "$LAKEKEEPER/management/v1/warehouse/$(jq -r .id <<<"$warehouse")/storage" \
    -H 'Content-Type: application/json' --data @- >/dev/null
echo "lakekeeper-init: warehouse '$LAKEHOUSE_WAREHOUSE' moved ${endpoint%/} -> $MINIO"
