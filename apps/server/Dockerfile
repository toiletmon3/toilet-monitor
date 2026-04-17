FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

# Copy monorepo root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

# Install all dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Generate Prisma client (using local prisma, not npx)
RUN cd apps/server && ./node_modules/.bin/prisma generate || \
    ../../node_modules/.bin/prisma generate || \
    node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js generate

# Build the server
RUN pnpm --filter=@toilet/server build

FROM node:22-alpine AS runner
WORKDIR /app

# Copy everything from builder - node_modules included
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/dist ./apps/server/dist
# Copy node_modules from builder (includes prisma@5 with correct binary)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

WORKDIR /app/apps/server
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main"]
