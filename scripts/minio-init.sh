#!/bin/sh
# Provisions MinIO for the lakehouse: warehouse bucket plus the non-root user
# Lakekeeper uses for S3 access and STS vending. Idempotent.
set -eu

mc alias set lake "http://minio:$MINIO_API_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

mc mb --ignore-existing "lake/$LAKEHOUSE_BUCKET"

# `user add` on an existing user just resets its secret key.
mc admin user add lake "$LAKEHOUSE_S3_ACCESS_KEY" "$LAKEHOUSE_S3_SECRET_KEY"

# Re-attaching an attached policy is an error; tolerate it.
mc admin policy attach lake readwrite --user "$LAKEHOUSE_S3_ACCESS_KEY" || true

echo "minio-init: bucket '$LAKEHOUSE_BUCKET' and user '$LAKEHOUSE_S3_ACCESS_KEY' ready"
