# Runtime Image Dockerfile
# Build context must be the monorepo root

# ============ STAGE 0: Alpine image with Bun (musl build) ============
# Alpine is a musl-based distro, so it natively provides the musl-compiled
# libstdc++ and libgcc_s that the Bun musl binary requires.
FROM alpine:3 AS bun-base

RUN apk add --no-cache curl unzip ca-certificates libstdc++

RUN ARCH=$(uname -m) && \
    case "$ARCH" in \
      x86_64)  BUN_ARCH="x64" ;; \
      aarch64) BUN_ARCH="aarch64" ;; \
      *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-${BUN_ARCH}-musl.zip" -o /tmp/bun.zip \
    && unzip /tmp/bun.zip -d /tmp/bun \
    && mv "/tmp/bun/bun-linux-${BUN_ARCH}-musl/bun" /usr/local/bin/bun \
    && chmod 755 /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun

# ============ STAGE 1: Install shim production dependencies ============
FROM bun-base AS shim-deps

WORKDIR /opt/shim
COPY invoke-runtime/package.json ./
# Install devDependencies too for the build step if needed, or just install all
RUN bun install
COPY invoke-runtime/src/ ./src/
RUN bun run build
# Then remove devDependencies for smaller size if desired, but we just copy dist/ and node_modules/ anyway.
RUN bun install --production

# ============ STAGE 2: C++ supervisor builder ============
FROM alpine:3 AS supervisor-builder

RUN apk add --no-cache meson ninja build-base g++ pkgconf

WORKDIR /build
COPY invoke-runtime/meson.build ./
COPY invoke-runtime/supervisor/ ./supervisor/
# Copy vendored subprojects so meson builds fully offline
COPY invoke-runtime/subprojects/ ./subprojects/
RUN meson setup builddir --backend=ninja --wrap-mode=nofallback \
    && ninja -C builddir

# ============ STAGE 3: Bun filesystem — source for /opt/rootfs ============
FROM bun-base AS bun-rootfs
# This stage exists solely so we can COPY its filesystem into /opt/rootfs below.

# ============ STAGE 4: Final runtime image ============
FROM alpine:3

# libstdc++ and libgcc are needed by the supervisor binary (C++20).
RUN apk add --no-cache libstdc++ libgcc

# --- Supervisor binary ---
COPY --from=supervisor-builder /build/builddir/invoke-supervisor /usr/local/bin/invoke-supervisor
RUN chmod 755 /usr/local/bin/invoke-supervisor

# --- Build /opt/rootfs (the chroot environment for user functions) ---
# Clone the full Bun image filesystem into /opt/rootfs. This gives the
# chroot a working Bun installation (binary + glibc + ssl certs + locale).
COPY --from=bun-rootfs / /opt/rootfs/

# Install the shim TypeScript sources and production deps into the rootfs.
# Bun executes .ts files natively — no compilation step needed.
#COPY invoke-runtime/src/ /opt/rootfs/opt/shim/src/
COPY --from=shim-deps /opt/shim/dist/ /opt/rootfs/opt/shim/dist/
COPY --from=shim-deps /opt/shim/node_modules/ /opt/rootfs/opt/shim/node_modules/
COPY invoke-runtime/package.json /opt/rootfs/opt/shim/package.json

# Create directories that must exist inside the rootfs but aren't part of the
# Bun image (virtual mounts, invocation scratch space).
RUN mkdir -p \
      /opt/rootfs/tmp \
      /opt/rootfs/proc \
      /opt/rootfs/sys \
      /opt/rootfs/dev \
      /opt/rootfs/run \
      /opt/rootfs/functions \
      /opt/inv

# Expose bun and the shim at container-level paths so the supervisor can
# reference /opt/shim/src/worker-main.ts as the worker script.
# Create a node -> bun symlink inside the rootfs so Bun's node-compatibility
# shim finder doesn't need to synthesise one (which requires /proc/self/exe).
RUN ln -sf /usr/local/bin/bun /opt/rootfs/usr/local/bin/node \
    && ln -sf /opt/rootfs/usr/local/bin/bun /usr/local/bin/bun \
    && ln -sf /opt/rootfs/opt/shim /opt/shim

ENTRYPOINT ["/usr/local/bin/invoke-supervisor"]
