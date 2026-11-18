#!/usr/bin/env bash
# Transur production helper.
#   ./deploy.sh certs     – obtain a Let's Encrypt certificate for $DOMAIN
#   ./deploy.sh up        – build and start everything behind Nginx
#   ./deploy.sh owner YOUR_EMAIL@example.com YOUR_PASSWORD "YOUR_NAME" – create a console owner
#   ./deploy.sh logs [service] | status | backup | update | down
set -euo pipefail
cd "$(dirname "$0")"

[[ -f .env ]] || { echo "✖ .env not found. Run: cp .env.example .env"; exit 1; }
if grep -q 'YOUR_' .env; then
  echo "✖ .env still has YOUR_ placeholder values. Replace them first:"; grep -n 'YOUR_' .env; exit 1
fi
set -a; source .env; set +a

compose() { docker compose --profile proxy "$@"; }

case "${1:-help}" in
  certs)
    : "${DOMAIN:?set DOMAIN in .env}" "${LETSENCRYPT_EMAIL:?set LETSENCRYPT_EMAIL in .env}"
    mkdir -p nginx/certs nginx/acme
    docker run --rm -p 80:80 -v "$PWD/nginx/certs-le:/etc/letsencrypt" certbot/certbot certonly \
      --standalone -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --non-interactive
    cp "nginx/certs-le/live/$DOMAIN/fullchain.pem" "nginx/certs-le/live/$DOMAIN/privkey.pem" nginx/certs/
    sed -i.bak "s/transur.example/$DOMAIN/g" nginx/nginx.conf && rm -f nginx/nginx.conf.bak
    echo "✓ certificate installed for $DOMAIN"
    ;;
  up)
    compose up -d --build
    compose ps
    ;;
  owner)
    shift
    compose exec api node src/scripts/createOwner.js "$@"
    ;;
  logs)
    compose logs -f --tail=200 "${2:-api}"
    ;;
  status)
    compose ps
    curl -fsS "https://${DOMAIN}/api/health" && echo
    ;;
  backup)
    mkdir -p backups
    file="backups/transur-$(date +%Y%m%d-%H%M%S).sql.gz"
    compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines "$MYSQL_DATABASE"' | gzip > "$file"
    echo "✓ backup written to $file"
    ;;
  update)
    git pull --ff-only
    compose up -d --build
    ;;
  down)
    compose down
    ;;
  *)
    sed -n '2,7p' "$0"
    ;;
esac
