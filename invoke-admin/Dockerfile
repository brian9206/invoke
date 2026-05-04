# Admin Service Dockerfile
# Build context must be the monorepo root

# ============ BUILDER STAGE ============
FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY invoke-runtime/worker/package.json ./invoke-runtime/worker/
COPY invoke-runtime/types/package.json ./invoke-runtime/types/
COPY invoke-admin/package.json ./invoke-admin/

# Install dependencies
RUN npm ci -w invoke-shared -w invoke-worker -w invoke-types -w invoke-admin

# Copy source
COPY shared/ ./shared/
COPY invoke-runtime/worker/ ./invoke-runtime/worker/
COPY invoke-runtime/types/ ./invoke-runtime/types/
COPY invoke-admin/ ./invoke-admin/

# Build Next.js application
WORKDIR /app/invoke-admin
RUN npm run build

# Prune devDependencies
RUN npm prune --production -w invoke-admin

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
COPY --from=builder --chown=appuser:appgroup /app/invoke-runtime/types/ ./invoke-runtime/types/
COPY --from=builder --chown=appuser:appgroup /app/invoke-admin/ ./invoke-admin/
COPY --from=builder --chown=appuser:appgroup /app/node_modules/ ./node_modules/
COPY --chown=appuser:appgroup templates/ ./templates/

USER appuser

WORKDIR /app/invoke-admin

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
