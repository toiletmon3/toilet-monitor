#!/bin/bash
# Nginx watchdog — detects if the default nginx page is being served
# and automatically restores the correct config. Designed to run via cron.

NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
NGINX_CONF_DIR="/etc/nginx/sites-available"

# Use HTTPS with -k (self-signed OK) and -L (follow redirects) to test the real response
BODY=$(curl -s --max-time 5 -k -L "https://localhost" 2>/dev/null || echo "")

if echo "$BODY" | grep -qi "welcome to nginx"; then
  echo "$(date): ALERT — default nginx page detected, fixing..."

  rm -f "$NGINX_ENABLED_DIR/default"
  rm -f "$NGINX_CONF_DIR/default"
  rm -f /etc/nginx/conf.d/default.conf
  rm -f /var/www/html/index.nginx-debian.html

  if [ ! -f "$NGINX_ENABLED_DIR/toilet" ] && [ -f "$NGINX_CONF_DIR/toilet" ]; then
    ln -sf "$NGINX_CONF_DIR/toilet" "$NGINX_ENABLED_DIR/toilet"
  fi

  nginx -t 2>/dev/null && (nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true)

  sleep 2
  BODY_RETRY=$(curl -s --max-time 5 -k -L "https://localhost" 2>/dev/null || echo "")
  if echo "$BODY_RETRY" | grep -qi "welcome to nginx"; then
    echo "$(date): CRITICAL — auto-fix failed, manual intervention needed"
  else
    echo "$(date): Auto-fix successful — site restored"
  fi
fi
