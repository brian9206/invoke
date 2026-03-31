# Execution Service Dockerfile
# Build context must be the monorepo root
# Uses gVisor (runsc) for sandbox execution

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

# Install runtime dependencies + gVisor
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
  gnupg \
      iproute2 \
      iptables \
      fuse-overlayfs \
    && rm -rf /var/lib/apt/lists/*

# Install gVisor (runsc)
RUN curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
       > /etc/apt/sources.list.d/gvisor.list \
    && apt-get update && apt-get install -y --no-install-recommends runsc \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for the main process
RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup -m appuser

# Create sandbox runtime directories
RUN mkdir -p /var/run/invoke-sandboxes /var/run/invoke-overlays /app/checkpoints \
    && chown -R appuser:appgroup /var/run/invoke-sandboxes /var/run/invoke-overlays /app/checkpoints

WORKDIR /app

# Copy built artifacts and prod dependencies from builder
COPY --from=builder --chown=appuser:appgroup /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder --chown=appuser:appgroup /app/shared/ ./shared/
COPY --from=builder --chown=appuser:appgroup /app/invoke-execution/ ./invoke-execution/
COPY --from=builder --chown=appuser:appgroup /app/invoke-runtime/ ./invoke-runtime/
COPY --from=builder --chown=appuser:appgroup /app/node_modules/ ./node_modules/

# Note: runs as root for now because gVisor requires SYS_ADMIN/NET_ADMIN.
# The sandboxes themselves are unprivileged (UID 1000, no capabilities).

WORKDIR /app/invoke-execution

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]

