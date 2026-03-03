# Scheduler Service Dockerfile
# Build context must be the monorepo root
FROM node:24-alpine

# Install curl for health checks and cron for scheduling
RUN apk add --no-cache curl dcron

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json tsconfig.base.json ./

# Copy workspace package manifest (needed before npm ci)
COPY invoke-scheduler/package.json ./invoke-scheduler/

# Install all dependencies (including devDeps for TypeScript build)
RUN npm ci -w invoke-scheduler

# Copy scheduler source
COPY invoke-scheduler/ ./invoke-scheduler/

WORKDIR /app/invoke-scheduler

# Build TypeScript source
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production -w invoke-scheduler

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]
