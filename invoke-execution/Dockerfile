# Execution Service Dockerfile
# Build context must be the monorepo root

# ============ BUILDER STAGE ============
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY invoke-execution/package.json ./invoke-execution/
COPY invoke-runtime/worker/package.json ./invoke-runtime/worker/

# Install dependencies
RUN npm ci -w invoke-execution -w invoke-shared -w invoke-worker

# Copy source
COPY shared/ ./shared/
COPY invoke-execution/ ./invoke-execution/
COPY invoke-runtime/ ./invoke-runtime/

# Build TypeScript source for execution service
WORKDIR /app/invoke-execution
RUN npm run build

# Prune devDependencies
WORKDIR /app
RUN npm prune --production -w invoke-execution



# ============ FINAL STAGE ============
FROM node:24-bookworm-slim

# ---- Install Docker CE (for DIND) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg iptables iproute2 wget \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
             https://download.docker.com/linux/debian bookworm stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
    && rm -rf /var/lib/apt/lists/*

# ---- Install gVisor (runsc OCI runtime) ----
RUN set -e; \
    ARCH=$(uname -m); \
    URL="https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}"; \
    wget -q "${URL}/runsc" "${URL}/runsc.sha512" \
         "${URL}/containerd-shim-runsc-v1" "${URL}/containerd-shim-runsc-v1.sha512"; \
    sha512sum -c runsc.sha512; \
    sha512sum -c containerd-shim-runsc-v1.sha512; \
    rm -f *.sha512; \
    chmod a+rx runsc containerd-shim-runsc-v1; \
    mv runsc containerd-shim-runsc-v1 /usr/local/bin/

# ---- Configure inner Docker daemon to register the runsc runtime ----
# GVISOR_PLATFORM (ptrace or kvm) can be overridden at container runtime via
# the entrypoint; ptrace works in all environments, kvm requires /dev/kvm.
RUN mkdir -p /etc/docker && \
    printf '{\n  "runtimes": {\n    "runsc": { "path": "/usr/local/bin/runsc" }\n  }\n}\n' \
    > /etc/docker/daemon.json

WORKDIR /app

# Copy built artifacts and prod dependencies from builder
COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/shared/ ./shared/
COPY --from=builder /app/invoke-execution/ ./invoke-execution/
COPY --from=builder /app/invoke-runtime/ ./invoke-runtime/
COPY --from=builder /app/node_modules/ ./node_modules/

# Entrypoint: start dockerd, wait for it, then exec the app
COPY invoke-execution/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Runs as root — DIND requires privileged mode (set in docker-compose).
# iptables is used by SandboxOrchestrator for network policy management.

WORKDIR /app/invoke-execution

# Expose port
EXPOSE 3000

# Health check (curl is installed as part of the Docker CE deps above)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENV NODE_ENV=production
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
