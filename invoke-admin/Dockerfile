# Admin Service Dockerfile
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
COPY --chown=appuser:appgroup invoke-admin/package.json ./invoke-admin/

# Switch to non-root user before npm ci
USER appuser

# Install dependencies for admin and shared workspaces only (runs as appuser)
RUN npm ci --omit=dev -w invoke-shared && npm ci -w invoke-admin

# Copy shared source
COPY --chown=appuser:appgroup shared/ ./shared/

# Copy admin source
COPY --chown=appuser:appgroup invoke-admin/ ./invoke-admin/

WORKDIR /app/invoke-admin

# Build Next.js application
RUN npm run build

# Prune devDependencies
RUN npm prune --production -w invoke-admin

# Expose port
EXPOSE 3000

# Health check - check if the app is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start", "--", "-p", "3000", "-H", "0.0.0.0"]