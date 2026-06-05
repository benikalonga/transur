#!/bin/bash
# =============================================================================
# TRANSUR — Script de déploiement production
# Usage: ./deploy.sh [setup|start|stop|restart|update|logs|backup]
# =============================================================================

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose"
ENV_FILE="$APP_DIR/.env.production"

# Couleurs
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

check_env() {
  if [ ! -f "$ENV_FILE" ]; then
    warn "Fichier .env.production introuvable — création depuis le template..."
    cp "$APP_DIR/.env.example" "$ENV_FILE"
    error "Éditez $ENV_FILE avec vos vraies valeurs puis relancez."
  fi
  source "$ENV_FILE"
}

cmd_setup() {
  info "=== SETUP INITIAL TRANSUR ==="

  # Vérifier Docker
  command -v docker >/dev/null 2>&1 || error "Docker non installé"
  docker compose version >/dev/null 2>&1 || error "Docker Compose V2 non installé"

  check_env

  # Créer les répertoires nécessaires
  mkdir -p "$APP_DIR/backend/uploads/profiles"
  mkdir -p "$APP_DIR/logs"

  # SSL via Certbot (Let's Encrypt)
  if [ -n "$DOMAIN" ] && [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    info "Génération SSL pour $DOMAIN..."
    docker run --rm -p 80:80 \
      -v /etc/letsencrypt:/etc/letsencrypt \
      certbot/certbot certonly --standalone \
      -d "$DOMAIN" \
      --email "$SSL_EMAIL" --agree-tos --non-interactive
    success "SSL généré"
  fi

  success "Setup terminé !"
  info "Lancez maintenant: ./deploy.sh start"
}

cmd_start() {
  info "=== DÉMARRAGE TRANSUR ==="
  check_env

  cd "$APP_DIR"
  $COMPOSE --env-file "$ENV_FILE" -f docker-compose.yml -f nginx/docker-compose.prod.yml up -d --build

  info "Attente démarrage MySQL..."
  sleep 15

  # Exécuter les migrations
  info "Exécution des migrations..."
  $COMPOSE exec backend node src/config/migrate.js && success "Migrations OK" || warn "Migrations: vérifiez les logs"

  success "=== Transur démarré ==="
  info "Frontend : https://${DOMAIN:-localhost}"
  info "API      : https://${DOMAIN:-localhost}/api/health"
}

cmd_stop() {
  info "Arrêt des services..."
  cd "$APP_DIR"
  $COMPOSE down
  success "Arrêté"
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_update() {
  info "=== MISE À JOUR TRANSUR ==="
  check_env
  cd "$APP_DIR"

  info "Pull du code..."
  git pull origin main

  info "Rebuild et restart..."
  $COMPOSE --env-file "$ENV_FILE" -f docker-compose.yml -f nginx/docker-compose.prod.yml up -d --build

  info "Migrations..."
  sleep 10
  $COMPOSE exec backend node src/config/migrate.js || warn "Vérifiez les migrations"

  success "Mise à jour terminée"
}

cmd_logs() {
  SERVICE=${2:-""}
  cd "$APP_DIR"
  if [ -n "$SERVICE" ]; then
    $COMPOSE logs -f --tail=100 "$SERVICE"
  else
    $COMPOSE logs -f --tail=50
  fi
}

cmd_backup() {
  info "=== BACKUP MySQL ==="
  BACKUP_DIR="$APP_DIR/backups"
  mkdir -p "$BACKUP_DIR"
  FILENAME="transur_$(date +%Y%m%d_%H%M%S).sql.gz"

  check_env
  cd "$APP_DIR"

  $COMPOSE exec mysql sh -c \
    "mysqldump -u root -p\${MYSQL_ROOT_PASSWORD} transur" \
    | gzip > "$BACKUP_DIR/$FILENAME"

  success "Backup: $BACKUP_DIR/$FILENAME"
  # Garder les 7 derniers backups
  ls -t "$BACKUP_DIR"/*.sql.gz | tail -n +8 | xargs -r rm
}

cmd_status() {
  cd "$APP_DIR"
  $COMPOSE ps
  echo ""
  info "Santé API:"
  curl -sf "http://localhost:5000/api/health" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "API non accessible"
}

# ─── Entrée principale ────────────────────────────────────────────────────────
case "${1:-help}" in
  setup)   cmd_setup ;;
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  update)  cmd_update ;;
  logs)    cmd_logs "$@" ;;
  backup)  cmd_backup ;;
  status)  cmd_status ;;
  *)
    echo "Usage: $0 {setup|start|stop|restart|update|logs [service]|backup|status}"
    echo ""
    echo "  setup    — Première installation (SSL, répertoires)"
    echo "  start    — Démarrer tous les services"
    echo "  stop     — Arrêter tous les services"
    echo "  restart  — Redémarrer"
    echo "  update   — Mettre à jour depuis git et rebuild"
    echo "  logs     — Voir les logs (optionnel: service=backend|frontend|mysql)"
    echo "  backup   — Sauvegarder la base MySQL"
    echo "  status   — État des services"
    ;;
esac
