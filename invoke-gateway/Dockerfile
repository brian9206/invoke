# API Gateway Service Dockerfile
# Build context must be the monorepo root
FROM node:24-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json tsconfig.base.json ./

# Copy workspace package manifests (needed before npm ci)
COPY shared/package.json ./shared/
COPY invoke-gateway/package.json ./invoke-gateway/

# Install all dependencies (including devDeps for TypeScript build)
RUN npm ci -w invoke-gateway -w invoke-shared

# Copy shared source
COPY shared/ ./shared/

# Copy gateway source
COPY invoke-gateway/ ./invoke-gateway/

WORKDIR /app/invoke-gateway

# Build TypeScript source
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production -w invoke-gateway

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]

