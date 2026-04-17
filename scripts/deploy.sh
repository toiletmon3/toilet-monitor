#!/bin/bash
set -e

echo "🚀 Deploying toilet-monitor..."
cd /opt/toilet-monitor

# Load environment variables
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
fi

# Pull latest code
echo "📥 Pulling latest code..."
git pull

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
cd apps/server
pnpm exec prisma generate

# Push schema to database (creates/updates tables)
echo "🗄️ Pushing database schema..."
pnpm exec prisma db push --accept-data-loss

# Seed if first deploy
if [ "$1" = "--seed" ]; then
  echo "🌱 Seeding database..."
  pnpm exec ts-node prisma/seed.ts
fi

cd /opt/toilet-monitor

# Build server
echo "🔨 Building server..."
pnpm --filter=@toilet/server build

# Build frontend
echo "🎨 Building frontend..."
pnpm --filter=@toilet/web build

# Copy frontend to nginx
echo "📋 Copying frontend to nginx..."
cp -r apps/web/dist/* /var/www/toilet/

# Restart server with PM2
echo "🔄 Restarting server..."
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

echo "✅ Deploy complete!"
echo "🌐 App running at http://$(curl -s ifconfig.me)"
