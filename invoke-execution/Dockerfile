# API Gateway Service Dockerfile
# Build context must be the monorepo root
FROM node:24-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user first
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY --chown=appuser:appgroup package.json package-lock.json tsconfig.base.json ./

# Copy workspace package manifests (needed before npm ci)
COPY --chown=appuser:appgroup shared/package.json ./shared/
COPY --chown=appuser:appgroup invoke-execution/package.json ./invoke-execution/

# Switch to non-root user before npm ci
USER appuser

# Install all dependencies (including devDeps for TypeScript build, runs as appuser)
RUN npm ci -w invoke-execution -w invoke-shared

# Copy shared source
COPY --chown=appuser:appgroup shared/ ./shared/

# Copy execution source
COPY --chown=appuser:appgroup invoke-execution/ ./invoke-execution/

WORKDIR /app/invoke-execution

# Build TypeScript source
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production -w invoke-execution

# Run as non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]

