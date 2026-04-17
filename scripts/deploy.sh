#!/bin/bash
set -e

echo "🚀 Deploying toilet-monitor..."
cd /opt/toilet-monitor

# Load environment variables
if [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
fi

# Pull latest code
echo "📥 Pulling latest code..."
git pull

# Install dependencies (allow build scripts for Prisma/bcrypt/esbuild)
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile
pnpm approve-builds --yes 2>/dev/null || true

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
cd apps/server
pnpm exec prisma generate

# Push schema to database (creates/updates tables without migrations)
echo "🗄️ Pushing database schema..."
pnpm exec prisma db push --accept-data-loss

# Seed if first deploy
if [ "$1" = "--seed" ]; then
  echo "🌱 Seeding database..."
  pnpm exec ts-node --project tsconfig.json prisma/seed.ts
fi

cd /opt/toilet-monitor

# Build server
echo "🔨 Building server..."
pnpm --filter=@toilet/server build

# Verify server build artifact
if [ ! -f apps/server/dist/main.js ]; then
  echo "❌ Server build failed - dist/main.js not found"
  exit 1
fi
echo "✅ Server build verified at apps/server/dist/main.js"

# Build frontend
echo "🎨 Building frontend..."
pnpm --filter=@toilet/web build

# Copy frontend to nginx
echo "📋 Copying frontend to nginx..."
mkdir -p /var/www/toilet
cp -r apps/web/dist/* /var/www/toilet/

# Create log directory
mkdir -p /var/log/toilet

# Restart server with PM2
echo "🔄 Restarting server with PM2..."
if pm2 list | grep -q "toilet-server"; then
  pm2 restart ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo ""
echo "✅ Deploy complete!"
echo "🌐 App running at http://$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo '<your-server-ip>')"
echo ""
echo "📋 Access URLs:"
echo "   Admin:   http://$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo 'SERVER_IP')/admin"
echo "   Cleaner: http://$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo 'SERVER_IP')/cleaner"
echo "   Kiosk:   http://$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo 'SERVER_IP')/kiosk/DEVICE_CODE"
echo ""
echo "👤 Default admin: admin@demo.com / Admin123!"
