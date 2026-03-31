# Runtime Image Dockerfile
# Build context must be the monorepo root

# ============ BUILDER STAGE ============
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY invoke-runtime/package.json ./invoke-runtime/

# Install dependencies
RUN npm ci -w invoke-runtime

# Copy source
COPY invoke-runtime/ ./invoke-runtime/

# Build TypeScript source
WORKDIR /app/invoke-runtime
RUN npm run build

# Prune devDependencies
RUN npm prune --production -w invoke-runtime

# ============ FINAL STAGE ============
FROM node:24-bookworm-slim

# Create non-root sandbox user/group if UID/GID 1000 are not already present
RUN if ! getent group 1000 >/dev/null; then groupadd -g 1000 sandbox; fi \
	&& if ! id -u 1000 >/dev/null 2>&1; then useradd -u 1000 -g 1000 -m sandbox; fi

WORKDIR /opt/shim

# Copy built artifacts and prod dependencies from builder
COPY --from=builder --chown=1000:1000 /app/invoke-runtime/dist/ ./dist/
COPY --from=builder --chown=1000:1000 /app/invoke-runtime/package.json ./
COPY --from=builder --chown=1000:1000 /app/invoke-runtime/node_modules/ ./node_modules/

USER 1000:1000

ENTRYPOINT ["node", "/opt/shim/dist/index.js"]
