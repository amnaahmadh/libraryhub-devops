#!/usr/bin/env bash
# Part I: starts LibraryHub on this EC2 instance from the image on Docker Hub.
# Creates .env on the first run if it does not exist yet: random secrets, except the password of
# the read-only "evaluator" account, which is taken from DB_READONLY_PASSWORD when given because
# it is shared with the evaluator and must be the same in the Jenkins credential (Part II).
#
#   DB_READONLY_PASSWORD=<letters-and-digits> bash scripts/deploy-part1.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Creating .env"
  (
    umask 077
    cat > .env <<ENV
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
DB_PASSWORD=$(openssl rand -hex 16)
DB_READONLY_PASSWORD=${DB_READONLY_PASSWORD:-$(openssl rand -hex 12)}
SESSION_SECRET=$(openssl rand -hex 32)
ENV
  )
fi

docker compose pull
docker compose up -d --wait --wait-timeout 180
docker compose ps
curl -fsS http://localhost/health
echo

ip="$(curl -fsS -m 5 https://checkip.amazonaws.com || echo '<EC2-IP>')"
echo
echo "Application        : http://${ip}/"
echo "Database           : ${ip}:3307, database library_db"
echo "Read-only account  : evaluator / $(sed -n 's/^DB_READONLY_PASSWORD=//p' .env)"
