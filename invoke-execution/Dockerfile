# Execution Service Dockerfile
# Build context must be the monorepo root
FROM node:24-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json ./

# Copy workspace package manifests (needed before npm ci)
COPY shared/package.json ./shared/
COPY invoke-execution/package.json ./invoke-execution/

# Install dependencies for execution and shared workspaces only
RUN npm ci --omit=dev -w invoke-execution -w invoke-shared

# Copy shared source
COPY shared/ ./shared/

# Copy execution source
COPY invoke-execution/ ./invoke-execution/

WORKDIR /app/invoke-execution

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]