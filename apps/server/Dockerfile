FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

# Copy monorepo root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Generate Prisma client BEFORE building
RUN cd apps/server && npx prisma generate

# Build the server
RUN pnpm --filter=@toilet/server build

FROM node:22-alpine AS runner
WORKDIR /app/apps/server
RUN npm install -g pnpm

COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/apps/server/node_modules ./node_modules

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
