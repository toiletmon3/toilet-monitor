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

# Configure nginx
cat > /etc/nginx/sites-available/toilet << 'EOF'
server {
    listen 80;
    server_name _;

    root /var/www/toilet;
    index index.html;

    # Serve React app
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to NestJS
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Cache static assets
    location ~* \.(js|css|png|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/toilet /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

echo "✅ Server setup complete!"
echo "Now run: cd /opt/toilet-monitor && bash scripts/deploy.sh --seed"
