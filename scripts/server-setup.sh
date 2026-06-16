#!/bin/bash
# Run this ONCE on a fresh server to set everything up
set -e

echo "🛠️ Setting up server..."

# Update system
apt update && apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm pm2

# Install nginx
apt install -y nginx

# Create web root
mkdir -p /var/www/toilet
mkdir -p /var/log/toilet

# Configure nginx (HTTP-only for initial setup; deploy.sh adds SSL after certbot)
cat > /etc/nginx/sites-available/toilet << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name toiletcleanpro.duckdns.org _;

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
EOF

ln -sf /etc/nginx/sites-available/toilet /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default
rm -f /etc/nginx/conf.d/default.conf
rm -f /var/www/html/index.nginx-debian.html
nginx -t && systemctl restart nginx
systemctl enable nginx

echo "✅ Server setup complete!"
echo "Now run: cd /opt/toilet-monitor && bash scripts/deploy.sh --seed"
