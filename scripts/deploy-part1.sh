#!/usr/bin/env bash
# Part I: starts LibraryHub on this EC2 instance from the image on Docker Hub.
# Creates .env with random secrets on the first run if it does not exist yet.
#
#   bash scripts/deploy-part1.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Creating .env with random secrets"
  (
    umask 077
    cat > .env <<ENV
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
DB_PASSWORD=$(openssl rand -hex 16)
DB_READONLY_PASSWORD=$(openssl rand -hex 12)
SESSION_SECRET=$(openssl rand -hex 32)
ENV
  )
fi

docker compose pull
docker compose up -d --wait --wait-timeout 180
docker compose ps
curl -fsS http://localhost/health
echo
