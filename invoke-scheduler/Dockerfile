# Scheduler Service Dockerfile
# Build context must be the monorepo root
FROM node:24-alpine

# Install curl for health checks and cron for scheduling
RUN apk add --no-cache curl dcron

# Create non-root user first
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY --chown=appuser:appgroup package.json package-lock.json tsconfig.base.json ./

# Copy workspace package manifest (needed before npm ci)
COPY --chown=appuser:appgroup invoke-scheduler/package.json ./invoke-scheduler/

# Switch to non-root user before npm ci
USER appuser

# Install all dependencies (including devDeps for TypeScript build, runs as appuser)
RUN npm ci -w invoke-scheduler

# Copy scheduler source
COPY --chown=appuser:appgroup invoke-scheduler/ ./invoke-scheduler/

WORKDIR /app/invoke-scheduler

# Build TypeScript source
RUN npm run build

# Remove devDependencies after build  
RUN npm prune --production -w invoke-scheduler

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
