#!/bin/sh
docker rm -f invoke-postgres
docker volume rm -f invoke_postgres_data
docker run -d --name invoke-postgres -p 5432:5432 -e POSTGRES_DB=invoke_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=invoke_password_123 -v invoke_postgres_data:/var/lib/postgresql/data postgres:15-alpine

docker rm -f invoke-minio
docker volume rm -f invoke_minio_data
docker run -d  --name invoke-minio -p 9000:9000 -p 9001:9001 -e "MINIO_ROOT_USER=invoke-minio" -e "MINIO_ROOT_PASSWORD=invoke-minio-password-123" -v invoke_minio_data:/data minio/minio:latest server /data --console-address ":9001"