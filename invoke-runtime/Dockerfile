# Runtime Image Dockerfile
# This image runs INSIDE Docker containers spawned by SandboxOrchestrator.
# The supervisor process runs as root (needs mount, chroot, setuid syscalls).
# Per-invocation worker processes drop to UID/GID 65534 (nobody/nogroup).
# Build context must be the monorepo root

# ============ BUILDER STAGE ============
FROM node:24-bookworm-slim AS builder

# Install build tools needed for native addons (chroot package uses node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY invoke-runtime/package.json ./invoke-runtime/

# Install dependencies (compiles native chroot addon)
RUN npm ci -w invoke-runtime

# Copy source
COPY invoke-runtime/ ./invoke-runtime/

# Build TypeScript source
WORKDIR /app/invoke-runtime
RUN npm run build

# Prune devDependencies
WORKDIR /app
RUN npm prune --omit=dev

# ============ FINAL STAGE ============
FROM node:24-bookworm-slim

# Install util-linux for mount/umount
RUN apt-get update && apt-get install -y --no-install-recommends \
      util-linux \
    && rm -rf /var/lib/apt/lists/*

# Create nobody/nogroup at UID/GID 65534 for worker processes
RUN (getent group 65534 || groupadd -g 65534 nogroup) \
 && (id -u 65534 >/dev/null 2>&1 || useradd -u 65534 -g 65534 -M -s /sbin/nologin nobody-worker)

# Create secure invocation jail base dir (must not live under /tmp for chroot)
RUN mkdir -p /opt/inv \
 && chown root:root /opt/inv \
 && chmod 0755 /opt/inv

WORKDIR /opt/shim

# Copy built artifacts and prod dependencies from builder.
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/invoke-runtime/dist/ ./dist/
COPY --from=builder /app/invoke-runtime/package.json ./
COPY --from=builder /app/invoke-runtime/node_modules/ ./node_modules/

# Supervisor runs as root — must mount overlayfs and call chroot
# Worker drops privileges internally via process.setuid/setgid
ENTRYPOINT ["node", "/opt/shim/dist/index.js"]
