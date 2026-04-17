FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

# Copy monorepo root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

# Install all dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Generate Prisma client BEFORE building
RUN cd apps/server && npx prisma generate

# Build the server
RUN pnpm --filter=@toilet/server build

FROM node:22-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm

# Copy monorepo files needed for pnpm install
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Install production deps (includes prisma CLI)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Generate Prisma client for production
RUN cd apps/server && npx prisma generate

WORKDIR /app/apps/server
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
