#!/bin/bash
set -e

cd /opt/toilet-monitor
git pull

# Load production environment variables (source of DATABASE_URL etc.)
ENV_FILE="/opt/toilet-monitor/.env.production"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "Loaded env from $ENV_FILE"
else
  echo "WARNING: $ENV_FILE not found, trying fallback locations..."
  for f in /opt/toilet-monitor/apps/server/.env /opt/toilet-monitor/.env; do
    if [ -f "$f" ]; then
      set -a; source "$f"; set +a
      echo "Loaded env from $f"
      break
    fi
  done
fi

# Install / update dependencies (picks up any new packages from pnpm-lock.yaml)
cd /opt/toilet-monitor
pnpm install --frozen-lockfile

# Apply DB schema changes + regenerate Prisma client
cd /opt/toilet-monitor/apps/server
pnpm exec prisma db push --accept-data-loss
cd /opt/toilet-monitor

# Build server (prisma generate runs automatically after db push)
pnpm --filter=@toilet/server build

# Restart backend
pm2 restart toilet-server
pm2 save

# Build frontend
pnpm --filter=@toilet/web build

# --- Detect nginx html root ---
NGINX_ROOT=""
NGINX_ROOT=$(nginx -T 2>/dev/null | grep -m1 "root " | awk '{print $2}' | tr -d ';' || true)
if [ -z "$NGINX_ROOT" ] || [ ! -d "$NGINX_ROOT" ]; then
  for p in /usr/share/nginx/html /var/www/html /opt/toilet-monitor/apps/web/dist; do
    if [ -d "$p" ]; then NGINX_ROOT="$p"; break; fi
  done
fi

echo "Nginx root: $NGINX_ROOT"
cp -r apps/web/dist/. "$NGINX_ROOT/"
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

echo "Deploy complete"
