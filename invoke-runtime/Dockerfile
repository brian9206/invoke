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

# ============ STAGE 1: Worker builder ============
FROM bun-base AS worker-builder

WORKDIR /opt/shim
COPY invoke-runtime/worker/package.json ./
# Install devDependencies too for the build step if needed, or just install all
RUN bun install
COPY invoke-runtime/worker/src/ ./src/
RUN bun run build

# ============ STAGE 2: C++ supervisor builder ============
FROM alpine:3 AS supervisor-builder

RUN apk add --no-cache meson ninja build-base g++ pkgconf

WORKDIR /build
COPY invoke-runtime/supervisor/ ./
RUN meson setup builddir --backend=ninja --wrap-mode=nofallback \
    && ninja -C builddir

# ============ STAGE 3: Final runtime image ============
FROM alpine:3

# libstdc++ and libgcc are needed by the supervisor binary (C++20).
RUN apk add --no-cache libstdc++ libgcc

# --- Supervisor binary ---
COPY --from=supervisor-builder /build/builddir/invoke-supervisor /usr/local/bin/invoke-supervisor
RUN chmod 755 /usr/local/bin/invoke-supervisor

# --- Build /opt/rootfs (the chroot environment for user functions) ---
# Copy only the minimal files Bun needs to run inside the chroot.

# Bun binary
COPY --from=bun-base /usr/local/bin/bun /opt/rootfs/usr/local/bin/bun

# musl dynamic linker / libc (arch-specific, e.g. ld-musl-x86_64.so.1)
COPY --from=bun-base /lib/ld-musl-*.so.1 /opt/rootfs/lib/

# C++ runtime libraries required by Bun
COPY --from=bun-base /usr/lib/libstdc++.so.6* /opt/rootfs/usr/lib/
COPY --from=bun-base /usr/lib/libgcc_s.so.1   /opt/rootfs/usr/lib/

# TLS certificate bundle (needed for HTTPS inside functions)
COPY --from=bun-base /etc/ssl/certs/ca-certificates.crt /opt/rootfs/etc/ssl/certs/ca-certificates.crt

# Copy the worker shim files built in the worker-builder stage.
COPY --from=worker-builder /opt/shim/dist/ /opt/rootfs/opt/shim/
RUN chmod 755 /opt/rootfs/opt/shim/worker

# Create directories that must exist inside the rootfs but aren't part of the
# Bun image (virtual mounts, invocation scratch space).
RUN mkdir -p \
      /opt/rootfs/tmp \
      /opt/rootfs/proc \
      /opt/rootfs/sys \
      /opt/rootfs/dev \
      /opt/rootfs/run \
      /opt/inv

# Expose bun and the shim at container-level paths so the supervisor can
# reference /opt/shim/src/index.ts as the worker script.
# Create a node -> bun symlink inside the rootfs so Bun's node-compatibility
# shim finder doesn't need to synthesise one (which requires /proc/self/exe).
RUN ln -sf /usr/local/bin/bun /opt/rootfs/usr/local/bin/node \
    && ln -sf /opt/rootfs/usr/local/bin/bun /usr/local/bin/bun \
    && ln -sf /opt/rootfs/opt/shim /opt/shim

ENTRYPOINT ["/usr/local/bin/invoke-supervisor"]
