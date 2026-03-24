# API Gateway Service Dockerfile
# Build context must be the monorepo root

# ============ BUILDER STAGE ============
FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY invoke-gateway/package.json ./invoke-gateway/

# Install dependencies
RUN npm ci -w invoke-gateway -w invoke-shared

# Copy source
COPY shared/ ./shared/
COPY invoke-gateway/ ./invoke-gateway/

# Build TypeScript source
WORKDIR /app/invoke-gateway
RUN npm run build

# Prune devDependencies
RUN npm prune --production -w invoke-gateway

# ============ FINAL STAGE ============
FROM node:24-alpine

# Install runtime dependencies
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy built artifacts and prod dependencies from builder
COPY --from=builder --chown=appuser:appgroup /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder --chown=appuser:appgroup /app/shared/ ./shared/
COPY --from=builder --chown=appuser:appgroup /app/invoke-gateway/ ./invoke-gateway/
COPY --from=builder --chown=appuser:appgroup /app/node_modules/ ./node_modules/

USER appuser

WORKDIR /app/invoke-gateway

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]

