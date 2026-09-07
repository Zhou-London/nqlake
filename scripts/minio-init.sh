#!/bin/sh
# Prepares MinIO for the lakehouse. The `minio-init` compose job runs this
# script in the lakehouse/mc image. The script creates the warehouse bucket
# and the non-root user Lakekeeper uses for S3 access and STS credential
# vending. The user cannot be root: MinIO refuses AssumeRole for root.
# Every step is idempotent, so the job can run on every `make up`.
#
# Environment (all set by compose.yaml from .env):
#   MINIO_ROOT_USER, MINIO_ROOT_PASSWORD   admin credentials
#   MINIO_API_PORT                         port MinIO listens on
#   LAKEHOUSE_BUCKET                       bucket holding Iceberg data
#   LAKEHOUSE_S3_ACCESS_KEY, LAKEHOUSE_S3_SECRET_KEY   the user to create
set -eu

for var in MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_API_PORT LAKEHOUSE_BUCKET LAKEHOUSE_S3_ACCESS_KEY LAKEHOUSE_S3_SECRET_KEY; do
    eval "value=\${$var:-}"
    if [ -z "$value" ]; then
        echo "minio-init: $var is not set" >&2
        exit 1
    fi
done

# The root credentials are used only here, to register the alias.
mc alias set minio "http://minio:${MINIO_API_PORT}" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

mc mb --ignore-existing "minio/${LAKEHOUSE_BUCKET}"

# `user add` on an existing user resets the secret to the current .env value.
mc admin user add minio "$LAKEHOUSE_S3_ACCESS_KEY" "$LAKEHOUSE_S3_SECRET_KEY"

# The readwrite policy covers every bucket. The warehouse bucket is the only
# bucket here. Attaching a policy that is already attached succeeds.
mc admin policy attach minio readwrite --user "$LAKEHOUSE_S3_ACCESS_KEY"

echo "minio-init: bucket ${LAKEHOUSE_BUCKET} and user ${LAKEHOUSE_S3_ACCESS_KEY} are ready"
