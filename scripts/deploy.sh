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

# Inject VAPID keys from CI environment into .env.production (idempotent)
if [ -n "$VAPID_PUBLIC_KEY" ] && [ -n "$VAPID_PRIVATE_KEY" ]; then
  grep -q "VAPID_PUBLIC_KEY" "$ENV_FILE" 2>/dev/null \
    || echo "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" >> "$ENV_FILE"
  grep -q "VAPID_PRIVATE_KEY" "$ENV_FILE" 2>/dev/null \
    || echo "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY" >> "$ENV_FILE"
  echo "VAPID keys ensured in $ENV_FILE"
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

# Restart backend — --update-env ensures new env vars (e.g. VAPID keys) are
# picked up by the running process, not just inherited from the saved PM2 config.
pm2 restart toilet-server --update-env
pm2 save

# Build frontend
pnpm --filter=@toilet/web build

# --- Always write the nginx config to prevent the default page from showing ---
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
NGINX_ROOT="/var/www/toilet"

mkdir -p "$NGINX_ROOT"

# Detect SSL cert paths (Let's Encrypt via certbot)
SSL_CERT="/etc/letsencrypt/live/toiletcleanpro.duckdns.org/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/toiletcleanpro.duckdns.org/privkey.pem"

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
  echo "SSL certs found — writing HTTPS nginx config"
  cat > "$NGINX_CONF_DIR/toilet" << NGINXEOF
server {
    listen 80;
    server_name toiletcleanpro.duckdns.org;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name toiletcleanpro.duckdns.org;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/toilet;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location ~* \.(js|css|png|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF
else
  echo "No SSL certs found — writing HTTP-only nginx config"
  cat > "$NGINX_CONF_DIR/toilet" << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    root /var/www/toilet;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location ~* \.(js|css|png|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF
fi

# Enable site, disable ALL default configs (idempotent)
ln -sf "$NGINX_CONF_DIR/toilet" "$NGINX_ENABLED_DIR/toilet"
rm -f "$NGINX_ENABLED_DIR/default"
rm -f /etc/nginx/conf.d/default.conf

nginx -t

echo "Nginx root: $NGINX_ROOT"
cp -r apps/web/dist/. "$NGINX_ROOT/"
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

echo "Deploy complete"
