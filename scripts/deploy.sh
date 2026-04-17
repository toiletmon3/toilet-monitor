#!/bin/bash
set -e

cd /opt/toilet-monitor
git pull

# Build server
pnpm --filter=@toilet/server build

# Restart backend
pm2 restart toilet-server
pm2 save

# Build frontend
pnpm --filter=@toilet/web build

# --- Detect nginx html root ---
NGINX_ROOT=""
# Try to get root from active nginx config
NGINX_ROOT=$(nginx -T 2>/dev/null | grep -m1 "root " | awk '{print $2}' | tr -d ';' || true)
# Fallback to common paths
if [ -z "$NGINX_ROOT" ] || [ ! -d "$NGINX_ROOT" ]; then
  for p in /usr/share/nginx/html /var/www/html /opt/toilet-monitor/apps/web/dist; do
    if [ -d "$p" ]; then NGINX_ROOT="$p"; break; fi
  done
fi

echo "Nginx root: $NGINX_ROOT"
echo "Nginx config:"
nginx -T 2>/dev/null | grep -E "root |listen " || true

cp -r apps/web/dist/. "$NGINX_ROOT/"
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

echo "Deploy complete"
