# Execution Service Dockerfile
# Build context must be the monorepo root

# ============ BUILDER STAGE ============
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY invoke-execution/package.json ./invoke-execution/
COPY invoke-runtime/package.json ./invoke-runtime/

# Install dependencies
RUN npm ci -w invoke-execution -w invoke-shared -w invoke-runtime

# Copy source
COPY shared/ ./shared/
COPY invoke-execution/ ./invoke-execution/
COPY invoke-runtime/ ./invoke-runtime/

# Build invoke-runtime first (execution imports invoke-runtime/dist/protocol)
WORKDIR /app/invoke-runtime
RUN npm run build

# Build TypeScript source for execution service
WORKDIR /app/invoke-execution
RUN npm run build

# Prune devDependencies
WORKDIR /app
RUN npm prune --production -w invoke-execution -w invoke-runtime

# ============ FINAL STAGE ============
FROM node:24-bookworm-slim

# Install iptables (used by SandboxOrchestrator.setNetwork for Docker bridge filtering)
RUN apt-get update && apt-get install -y --no-install-recommends \
      iptables \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts and prod dependencies from builder
COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/shared/ ./shared/
COPY --from=builder /app/invoke-execution/ ./invoke-execution/
COPY --from=builder /app/invoke-runtime/ ./invoke-runtime/
COPY --from=builder /app/node_modules/ ./node_modules/

# Runs as root — needs access to Docker socket (/var/run/docker.sock)
# and permission to call iptables for network policy management.

WORKDIR /app/invoke-execution

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]
