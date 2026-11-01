#!/bin/bash
# Run by the official MySQL image only on the first start with an empty data volume
# (/docker-entrypoint-initdb.d). The entrypoint may source this file, so it must not call exit.
if [ -n "${DB_READONLY_USER:-}" ] && [ -n "${DB_READONLY_PASSWORD:-}" ]; then
  echo "Creating read-only user '${DB_READONLY_USER}' with SELECT on '${MYSQL_DATABASE}'"
  MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket -uroot <<SQL
CREATE USER IF NOT EXISTS '${DB_READONLY_USER}'@'%' IDENTIFIED WITH mysql_native_password BY '${DB_READONLY_PASSWORD}';
GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO '${DB_READONLY_USER}'@'%';
SQL
fi
