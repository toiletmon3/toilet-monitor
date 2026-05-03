#!/bin/bash
set -e

cd /opt/toilet-monitor
git pull

# Load production environment variables (source of DATABASE_URL etc.)
ENV_FILE="/opt/toilet-monitor/.env.production"

# Fix broken SMTP_PASS lines (unquoted app passwords with spaces) before sourcing
if [ -f "$ENV_FILE" ]; then
  sed -i '/^SMTP_PASS=$/d' "$ENV_FILE" 2>/dev/null || true
  # Remove any SMTP_PASS line that isn't properly quoted
  sed -i '/^SMTP_PASS=[^"]/d' "$ENV_FILE" 2>/dev/null || true
fi

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

# Inject SMTP credentials from CI environment (idempotent)
if [ -n "$SMTP_USER" ] && [ -n "$SMTP_PASS" ]; then
  # Fix any previously broken SMTP_PASS line (without quotes) by removing it first
  sed -i '/^SMTP_PASS=/d' "$ENV_FILE" 2>/dev/null || true
  echo "SMTP_PASS=\"$SMTP_PASS\"" >> "$ENV_FILE"
  grep -q "SMTP_USER" "$ENV_FILE" 2>/dev/null \
    || echo "SMTP_USER=\"$SMTP_USER\"" >> "$ENV_FILE"
  grep -q "SMTP_HOST" "$ENV_FILE" 2>/dev/null \
    || echo "SMTP_HOST=\"smtp.gmail.com\"" >> "$ENV_FILE"
  grep -q "SMTP_PORT" "$ENV_FILE" 2>/dev/null \
    || echo "SMTP_PORT=587" >> "$ENV_FILE"
  grep -q "SMTP_FROM" "$ENV_FILE" 2>/dev/null \
    || echo "SMTP_FROM=\"$SMTP_USER\"" >> "$ENV_FILE"
  echo "SMTP credentials ensured in $ENV_FILE"
fi

# Inject CRON_SECRET from CI environment (idempotent)
if [ -n "$CRON_SECRET" ]; then
  grep -q "CRON_SECRET" "$ENV_FILE" 2>/dev/null \
    || echo "CRON_SECRET=\"$CRON_SECRET\"" >> "$ENV_FILE"
  echo "CRON_SECRET ensured in $ENV_FILE"
fi

# Inject GITHUB_PAT from CI environment (idempotent)
if [ -n "$GITHUB_PAT" ]; then
  sed -i '/^GITHUB_PAT=/d' "$ENV_FILE" 2>/dev/null || true
  echo "GITHUB_PAT=\"$GITHUB_PAT\"" >> "$ENV_FILE"
  echo "GITHUB_PAT ensured in $ENV_FILE"
fi

# Install / update dependencies (picks up any new packages from pnpm-lock.yaml)
cd /opt/toilet-monitor
pnpm install --frozen-lockfile

# --- Pre-migration DB backup ---
BACKUP_DIR="/var/log/toilet/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pre_deploy_$TIMESTAMP.sql"

if command -v pg_dump &>/dev/null; then
  pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/dev/null && \
    echo "DB backup saved: $BACKUP_FILE" || \
    echo "WARNING: pg_dump failed (non-fatal)"
elif docker exec toilet_postgres pg_dump -U postgres toilet_monitor > "$BACKUP_FILE" 2>/dev/null; then
  echo "DB backup saved (via docker): $BACKUP_FILE"
else
  echo "WARNING: Could not create DB backup — pg_dump not available"
fi

# Keep only last 20 backups
ls -t "$BACKUP_DIR"/pre_deploy_*.sql 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true

# Apply DB schema changes safely (never drops data)
cd /opt/toilet-monitor/apps/server

# Baseline: if _prisma_migrations table doesn't exist yet, mark baseline as applied
pnpm exec prisma migrate resolve --applied 0_baseline 2>/dev/null || true

# Run pending migrations (safe — refuses destructive changes)
pnpm exec prisma migrate deploy
pnpm exec prisma generate

# Auto-seed if DB is empty (no organizations exist)
ORG_COUNT=$(node -e 'const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.organization.count().then(c=>{console.log(c);p.$disconnect()}).catch(()=>{console.log("0");p.$disconnect()})' 2>/dev/null || echo "0")
if [ "$ORG_COUNT" = "0" ] || [ -z "$ORG_COUNT" ]; then
  echo "DB is empty — running seed..."
  pnpm exec ts-node prisma/seed.ts
  echo "Seed complete"
else
  echo "DB has $ORG_COUNT org(s) — skipping seed"
fi

cd /opt/toilet-monitor

# Build server (prisma generate runs automatically via migrate deploy)
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
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name toiletcleanpro.duckdns.org _;
    return 301 https://toiletcleanpro.duckdns.org\$request_uri;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name toiletcleanpro.duckdns.org _;

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
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001/socket.io/;
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
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/toilet;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001/socket.io/;
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

# Enable site, nuke ALL default configs so they can never shadow ours
ln -sf "$NGINX_CONF_DIR/toilet" "$NGINX_ENABLED_DIR/toilet"
rm -f "$NGINX_ENABLED_DIR/default"
rm -f "$NGINX_CONF_DIR/default"
rm -f /etc/nginx/conf.d/default.conf
rm -f /var/www/html/index.nginx-debian.html

nginx -t

echo "Nginx root: $NGINX_ROOT"
cp -r apps/web/dist/. "$NGINX_ROOT/"
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

# --- Post-deploy health check: verify nginx is NOT serving the default page ---
sleep 2
HEALTH_URL="https://localhost"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -k -L "$HEALTH_URL" 2>/dev/null || echo "000")
BODY=$(curl -s --max-time 5 -k -L "$HEALTH_URL" 2>/dev/null || echo "")

if echo "$BODY" | grep -qi "welcome to nginx"; then
  echo "FATAL: nginx is still serving the default page after deploy!"
  echo "Attempting automatic recovery..."

  rm -f "$NGINX_ENABLED_DIR/default"
  rm -f "$NGINX_CONF_DIR/default"
  rm -f /etc/nginx/conf.d/default.conf
  rm -f /var/www/html/index.nginx-debian.html
  nginx -t && (nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true)
  sleep 2

  BODY_RETRY=$(curl -s --max-time 5 -k -L "$HEALTH_URL" 2>/dev/null || echo "")
  if echo "$BODY_RETRY" | grep -qi "welcome to nginx"; then
    echo "FATAL: Recovery failed — site is still showing default nginx page!"
    exit 1
  else
    echo "Recovery successful — site is now serving the app."
  fi
elif [ "$RESPONSE" = "000" ]; then
  echo "WARNING: Could not reach $HEALTH_URL — nginx may not be running"
else
  echo "Health check passed (HTTP $RESPONSE) — site is serving the app."
fi

# --- Install certbot post-renewal hook to prevent default page after cert renewal ---
CERTBOT_HOOK_DIR="/etc/letsencrypt/renewal-hooks/post"
if [ -d "$CERTBOT_HOOK_DIR" ] || mkdir -p "$CERTBOT_HOOK_DIR" 2>/dev/null; then
  cat > "$CERTBOT_HOOK_DIR/fix-nginx-default.sh" << 'HOOKEOF'
#!/bin/bash
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default
rm -f /etc/nginx/conf.d/default.conf
rm -f /var/www/html/index.nginx-debian.html
ln -sf /etc/nginx/sites-available/toilet /etc/nginx/sites-enabled/toilet
nginx -t 2>/dev/null && (nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true)
HOOKEOF
  chmod +x "$CERTBOT_HOOK_DIR/fix-nginx-default.sh"
  echo "Certbot post-renewal hook installed"
fi

# --- Install nginx watchdog cron (runs every 5 min) ---
WATCHDOG="/opt/toilet-monitor/scripts/nginx-watchdog.sh"
if [ -f "$WATCHDOG" ]; then
  chmod +x "$WATCHDOG"
  CRON_LINE="*/5 * * * * $WATCHDOG >> /var/log/toilet/nginx-watchdog.log 2>&1"
  (crontab -l 2>/dev/null | grep -v "nginx-watchdog" ; echo "$CRON_LINE") | crontab -
  echo "Nginx watchdog cron installed (every 5 min)"
fi

echo "Deploy complete"
