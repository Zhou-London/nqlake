#!/usr/bin/env bash
# Prepares the Iceberg catalog. The `lakekeeper-init` compose job runs this
# script in the lakehouse/init image (bash, curl, jq). The script bootstraps
# Lakekeeper on first start, creates the warehouse when the catalog has none,
# and points an existing warehouse at MinIO's current port. Every step is
# idempotent, so the job can run on every `make up`.
#
# Environment (all set by compose.yaml from .env):
#   LAKEKEEPER_PORT                        port Lakekeeper listens on
#   MINIO_API_PORT                         port MinIO listens on
#   LAKEHOUSE_WAREHOUSE                    warehouse name in the catalog
#   LAKEHOUSE_BUCKET                       bucket holding Iceberg data
#   LAKEHOUSE_S3_ACCESS_KEY, LAKEHOUSE_S3_SECRET_KEY   MinIO user Lakekeeper uses
set -euo pipefail

for var in LAKEKEEPER_PORT MINIO_API_PORT LAKEHOUSE_WAREHOUSE LAKEHOUSE_BUCKET LAKEHOUSE_S3_ACCESS_KEY LAKEHOUSE_S3_SECRET_KEY; do
    if [[ -z "${!var:-}" ]]; then
        echo "lakekeeper-init: $var is not set" >&2
        exit 1
    fi
done

MANAGEMENT="http://lakekeeper:${LAKEKEEPER_PORT}/management/v1"
# Inside the compose network, MinIO is reached by its service name. Lakekeeper
# sends this same endpoint to query engines together with vended credentials.
S3_ENDPOINT="http://minio:${MINIO_API_PORT}/"

# Calls the management API once and prints the response body. On a non-2xx
# status, prints the status and body to stderr and returns 1.
api() {
    local method=$1 path=$2 body=${3:-}
    local response status
    response=$(curl --silent --show-error --write-out '\n%{http_code}' \
        --request "$method" "${MANAGEMENT}${path}" \
        --header 'content-type: application/json' \
        ${body:+--data "$body"})
    status=${response##*$'\n'}
    body=${response%$'\n'*}
    if [[ $status != 2* ]]; then
        echo "lakekeeper-init: $method $path returned $status: $body" >&2
        return 1
    fi
    printf '%s' "$body"
}

# --- bootstrap ---------------------------------------------------------------

if [[ $(api GET /info | jq -r '.bootstrapped') != true ]]; then
    api POST /bootstrap '{"accept-terms-of-use": true}' >/dev/null
    echo "lakekeeper-init: catalog bootstrapped"
else
    echo "lakekeeper-init: catalog already bootstrapped"
fi

# --- warehouse ---------------------------------------------------------------

storage_profile=$(jq --null-input \
    --arg bucket "$LAKEHOUSE_BUCKET" --arg endpoint "$S3_ENDPOINT" '{
    type: "s3",
    bucket: $bucket,
    "key-prefix": "warehouse",
    endpoint: $endpoint,
    region: "local-01",
    "path-style-access": true,
    flavor: "s3-compat",
    "sts-enabled": true
}')
storage_credential=$(jq --null-input \
    --arg key "$LAKEHOUSE_S3_ACCESS_KEY" --arg secret "$LAKEHOUSE_S3_SECRET_KEY" '{
    type: "s3",
    "credential-type": "access-key",
    "aws-access-key-id": $key,
    "aws-secret-access-key": $secret
}')

warehouse=$(api GET /warehouse | jq --arg name "$LAKEHOUSE_WAREHOUSE" '.warehouses[] | select(.name == $name)')

if [[ -z $warehouse ]]; then
    api POST /warehouse "$(jq --null-input \
        --arg name "$LAKEHOUSE_WAREHOUSE" \
        --argjson profile "$storage_profile" --argjson credential "$storage_credential" '{
        "warehouse-name": $name,
        "storage-profile": $profile,
        "storage-credential": $credential,
        "delete-profile": {type: "hard"}
    }')" >/dev/null
    echo "lakekeeper-init: warehouse ${LAKEHOUSE_WAREHOUSE} created on ${S3_ENDPOINT}${LAKEHOUSE_BUCKET}"
    exit 0
fi

warehouse_id=$(jq -r '.id' <<<"$warehouse")
current_endpoint=$(jq -r '."storage-profile".endpoint' <<<"$warehouse")
if [[ $current_endpoint == "$S3_ENDPOINT" ]]; then
    echo "lakekeeper-init: warehouse ${LAKEHOUSE_WAREHOUSE} already points at ${S3_ENDPOINT}"
    exit 0
fi

# MINIO_API_PORT changed in .env. The stored profile is replaced with one that
# keeps the same bucket and prefix, so existing tables stay reachable.
api POST "/warehouse/${warehouse_id}/storage" "$(jq --null-input \
    --argjson profile "$storage_profile" --argjson credential "$storage_credential" \
    '{"storage-profile": $profile, "storage-credential": $credential}')" >/dev/null
echo "lakekeeper-init: warehouse ${LAKEHOUSE_WAREHOUSE} moved from ${current_endpoint} to ${S3_ENDPOINT}"
