#!/bin/bash
# Reload Gmail OAuth secrets after refresh-token rotation
set -e

cd /opt/toilet-monitor

# --- Detect what changed since the last SUCCESSFULLY deployed commit ---
# We diff against a persisted marker (written only at the end of a successful
# deploy), NOT against pre-pull HEAD. With cancel-in-progress overlapping
# deploys, a cancelled run can still `git pull` the working copy forward, so a
# pre-pull-HEAD diff would compute an empty changeset and wrongly skip builds,
# leaving stale artefacts (e.g. an un-rebuilt web bundle) live.
DEPLOYED_MARKER="/opt/toilet-monitor/.last-deployed-sha"
LAST_DEPLOYED_SHA=$(cat "$DEPLOYED_MARKER" 2>/dev/null || echo "")
git pull
NEW_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")

# Only trust the marker if it names a commit we actually have in history.
if [ -n "$LAST_DEPLOYED_SHA" ] && git cat-file -e "${LAST_DEPLOYED_SHA}^{commit}" 2>/dev/null && [ -n "$NEW_SHA" ] && [ "$LAST_DEPLOYED_SHA" != "$NEW_SHA" ]; then
  CHANGED_FILES=$(git diff --name-only "$LAST_DEPLOYED_SHA" "$NEW_SHA" || echo "")
else
  CHANGED_FILES=""
fi

# Helper: returns 0 if any changed file matches the given regex
changed_match() {
  [ -z "$CHANGED_FILES" ] && return 1
  echo "$CHANGED_FILES" | grep -qE "$1"
}

# Decide which heavy steps to run. Force everything when we cannot reliably
# attribute the on-disk artefacts to NEW_SHA: no/invalid marker, marker
# unchanged but artefacts missing, or first deploy.
if [ -z "$LAST_DEPLOYED_SHA" ] || ! git cat-file -e "${LAST_DEPLOYED_SHA}^{commit}" 2>/dev/null || [ -z "$NEW_SHA" ] || [ ! -d /opt/toilet-monitor/node_modules ] || [ ! -d /opt/toilet-monitor/apps/server/node_modules ] || [ ! -d /opt/toilet-monitor/apps/web/node_modules ] || [ ! -d /opt/toilet-monitor/apps/web/dist ] || [ ! -d /opt/toilet-monitor/apps/server/dist ]; then
  RUN_INSTALL=1; RUN_MIGRATE=1; BUILD_SERVER=1; BUILD_WEB=1
  echo "No reliable deploy marker or missing build artefacts — running all steps"
else
  RUN_INSTALL=0; RUN_MIGRATE=0; BUILD_SERVER=0; BUILD_WEB=0
  changed_match '(^|/)package\.json$|^pnpm-lock\.yaml$|^pnpm-workspace\.yaml$' && RUN_INSTALL=1
  changed_match '^apps/server/prisma/(migrations/|schema\.prisma$)' && RUN_MIGRATE=1
  changed_match '^apps/server/|^packages/shared-types/' && BUILD_SERVER=1
  changed_match '^apps/web/|^packages/shared-types/' && BUILD_WEB=1
  # Lockfile change rebuilds everything (deps may have changed)
  if [ "$RUN_INSTALL" = "1" ]; then BUILD_SERVER=1; BUILD_WEB=1; fi
  echo "Change detection: install=$RUN_INSTALL migrate=$RUN_MIGRATE server=$BUILD_SERVER web=$BUILD_WEB"
fi

# Load production environment variables (source of DATABASE_URL etc.)
ENV_FILE="/opt/toilet-monitor/.env.production"

# --- Sanitize .env.production before sourcing ---
# Past deploys wrote secrets with embedded newlines, leaving lines like
# `$'\n'` that bash tries to execute when sourcing → exit 127 → deploy fails.
# We rebuild the file keeping only valid lines: comments, blanks, and
# proper KEY=value (where KEY is uppercase / digits / underscore).
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%s)" 2>/dev/null || true
  awk '
    /^[[:space:]]*#/ { print; next }                                 # comment
    /^[[:space:]]*$/ { print; next }                                 # blank
    /^[A-Za-z_][A-Za-z0-9_]*=/ { print; next }                       # KEY=value
    { next }                                                         # drop garbage
  ' "$ENV_FILE" > "${ENV_FILE}.clean" && mv "${ENV_FILE}.clean" "$ENV_FILE"
  # Also drop legacy broken SMTP_PASS lines
  sed -i '/^SMTP_PASS=$/d' "$ENV_FILE" 2>/dev/null || true
  sed -i '/^SMTP_PASS=[^"]/d' "$ENV_FILE" 2>/dev/null || true
fi

if [ -f "$ENV_FILE" ]; then
  # Source with set +e so any single bad line doesn't abort the whole deploy
  set +e
  set -a
  source "$ENV_FILE"
  SOURCE_EXIT=$?
  set +a
  set -e
  if [ "$SOURCE_EXIT" -ne 0 ]; then
    echo "WARNING: sourcing $ENV_FILE returned exit $SOURCE_EXIT (continuing anyway)"
  fi
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

# Strip surrounding whitespace/newlines from secrets — GitHub Secrets sometimes
# preserve trailing newlines from copy-paste, which corrupts OAuth requests.
trim() { echo -n "$1" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

# Inject Gmail API credentials from CI environment (idempotent).
# CRITICAL: also re-export the cleaned value into the current shell so that
# `pm2 restart --update-env` picks up the clean version. Without this, PM2
# inherits the dirty (newline-tailed) shell value, NestJS reads from
# process.env (which takes precedence over the .env file in ConfigModule),
# and OAuth requests get rejected with "invalid_client".
if [ -n "$GMAIL_CLIENT_ID" ]; then
  CLEAN=$(trim "$GMAIL_CLIENT_ID")
  sed -i '/^GMAIL_CLIENT_ID=/d' "$ENV_FILE" 2>/dev/null || true
  echo "GMAIL_CLIENT_ID=\"$CLEAN\"" >> "$ENV_FILE"
  export GMAIL_CLIENT_ID="$CLEAN"
fi
if [ -n "$GMAIL_CLIENT_SECRET" ]; then
  CLEAN=$(trim "$GMAIL_CLIENT_SECRET")
  sed -i '/^GMAIL_CLIENT_SECRET=/d' "$ENV_FILE" 2>/dev/null || true
  echo "GMAIL_CLIENT_SECRET=\"$CLEAN\"" >> "$ENV_FILE"
  export GMAIL_CLIENT_SECRET="$CLEAN"
fi
if [ -n "$GMAIL_REFRESH_TOKEN" ]; then
  CLEAN=$(trim "$GMAIL_REFRESH_TOKEN")
  sed -i '/^GMAIL_REFRESH_TOKEN=/d' "$ENV_FILE" 2>/dev/null || true
  echo "GMAIL_REFRESH_TOKEN=\"$CLEAN\"" >> "$ENV_FILE"
  export GMAIL_REFRESH_TOKEN="$CLEAN"
fi
if [ -n "$GMAIL_USER" ]; then
  CLEAN=$(trim "$GMAIL_USER")
  sed -i '/^GMAIL_USER=/d' "$ENV_FILE" 2>/dev/null || true
  echo "GMAIL_USER=\"$CLEAN\"" >> "$ENV_FILE"
  export GMAIL_USER="$CLEAN"
elif [ -n "$SMTP_USER" ]; then
  CLEAN=$(trim "$SMTP_USER")
  grep -q "GMAIL_USER" "$ENV_FILE" 2>/dev/null \
    || echo "GMAIL_USER=\"$CLEAN\"" >> "$ENV_FILE"
  export GMAIL_USER="$CLEAN"
fi
if [ -n "$GMAIL_CLIENT_ID" ] && [ -n "$GMAIL_CLIENT_SECRET" ] && [ -n "$GMAIL_REFRESH_TOKEN" ]; then
  echo "Gmail API credentials ensured in $ENV_FILE"
fi

# Legacy SMTP credentials (kept for backwards compat)
if [ -n "$SMTP_USER" ] && [ -n "$SMTP_PASS" ]; then
  sed -i '/^SMTP_PASS=/d' "$ENV_FILE" 2>/dev/null || true
  echo "SMTP_PASS=\"$SMTP_PASS\"" >> "$ENV_FILE"
  grep -q "SMTP_USER" "$ENV_FILE" 2>/dev/null \
    || echo "SMTP_USER=\"$SMTP_USER\"" >> "$ENV_FILE"
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

# Reconcile DB containers with docker-compose.databases.yml.
# `docker compose up -d` is idempotent: if the running container's config
# (e.g. port bindings) matches the YAML, nothing happens; if it diverges,
# Docker recreates the container. Named volumes persist, so data is safe.
# This makes infra changes (like binding Postgres/Redis to 127.0.0.1) take
# effect automatically on the next deploy instead of requiring manual SSH.
if [ -f /opt/toilet-monitor/docker-compose.databases.yml ]; then
  echo "Reconciling DB containers with docker-compose.databases.yml..."
  cd /opt/toilet-monitor
  docker compose -f docker-compose.databases.yml up -d --wait --wait-timeout 60 2>&1 \
    || docker compose -f docker-compose.databases.yml up -d 2>&1 \
    || echo "WARNING: docker compose up failed (non-fatal — continuing)"
fi

# Install / update dependencies (picks up any new packages from pnpm-lock.yaml)
cd /opt/toilet-monitor
if [ "$RUN_INSTALL" = "1" ]; then
  pnpm install --frozen-lockfile --prefer-offline
else
  echo "Skipping pnpm install (no package.json / lockfile changes)"
fi

if [ "$RUN_MIGRATE" = "1" ]; then
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
else
  echo "Skipping DB migration + backup (no schema/migration changes)"
  cd /opt/toilet-monitor/apps/server
fi

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
if [ "$BUILD_SERVER" = "1" ]; then
  pnpm --filter=@toilet/server build &
  SERVER_BUILD_PID=$!
else
  echo "Skipping server build (no apps/server or shared-types changes)"
  SERVER_BUILD_PID=""
fi

# Build frontend in parallel with server build
if [ "$BUILD_WEB" = "1" ]; then
  pnpm --filter=@toilet/web build &
  WEB_BUILD_PID=$!
else
  echo "Skipping web build (no apps/web or shared-types changes)"
  WEB_BUILD_PID=""
fi

# Wait for server build to finish before restarting PM2
if [ -n "$SERVER_BUILD_PID" ]; then
  wait "$SERVER_BUILD_PID"
fi

# Always restart backend so it picks up new env vars (secrets may have rotated even without code change)
pm2 restart toilet-server --update-env
pm2 save

# --- Surface email/Gmail OAuth status from PM2 logs into the CI deploy log ---
# Wait briefly for the server to boot and run EmailService.onApplicationBootstrap()
sleep 8
echo "=== Gmail OAuth status (last 40 lines of pm2 logs) ==="
pm2 logs toilet-server --lines 40 --nostream 2>/dev/null | grep -iE "gmail|email|oauth" || echo "(no email log lines found)"
echo "=== end Gmail OAuth status ==="

# Wait for the (parallel) web build started earlier
if [ -n "$WEB_BUILD_PID" ]; then
  wait "$WEB_BUILD_PID"
fi

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

# Record the commit whose artefacts are now actually live, so the next deploy
# can compute an accurate changeset even if this/previous runs overlapped.
echo "$NEW_SHA" > "$DEPLOYED_MARKER"

echo "Deploy complete"
