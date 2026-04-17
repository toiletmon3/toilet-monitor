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

# Copy to nginx html dir
cp -r apps/web/dist/. /usr/share/nginx/html/

# Reload nginx
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

echo "Deploy complete"
