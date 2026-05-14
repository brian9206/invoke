# Runtime Image Dockerfile
# Build context must be the monorepo root
ARG BUN_VERSION=1.3.13
ARG DOTNET_VERSION=10.0

# ============ Alpine image with Bun (musl build) ============
# Alpine is a musl-based distro, so it natively provides the musl-compiled
# libstdc++ and libgcc_s that the Bun musl binary requires.
FROM alpine:3 AS bun-base

RUN apk add --no-cache curl unzip ca-certificates libstdc++

ARG BUN_VERSION
RUN curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64-musl.zip" -o /tmp/bun.zip \
    && unzip /tmp/bun.zip -d /tmp/bun \
    && mv "/tmp/bun/bun-linux-x64-musl/bun" /usr/local/bin/bun \
    && chmod 755 /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun \
    && ln -sf /usr/local/bin/bun /usr/local/bin/node

# ============ Worker builder ============
FROM bun-base AS worker-builder

WORKDIR /opt/invoke
COPY tsconfig.base.json /
COPY invoke-runtime/worker/ ./
RUN bun install && bun run build

# ============ C++ supervisor builder ============
FROM alpine:3 AS supervisor-builder

RUN apk add --no-cache meson ninja build-base g++ pkgconf

WORKDIR /build
COPY invoke-runtime/supervisor/ ./
RUN meson setup builddir --backend=ninja --wrap-mode=nofallback \
    && ninja -C builddir

# ============ invoke-types package builder ============
FROM node:24-alpine AS invoke-types-builder

# tsconfig.json extends ../worker/tsconfig.json which extends ../../tsconfig.base.json,
# and includes ../worker/src/public-api. Copy all required files at their relative paths.
WORKDIR /opt/invoke-runtime
COPY tsconfig.base.json /opt/tsconfig.base.json
COPY invoke-runtime/types/ ./types/
COPY invoke-runtime/worker/ ./worker/
RUN cd worker && npm install

WORKDIR /opt/invoke-runtime/types
RUN npm install && npm pack

# ============ .NET SDK package builder ============
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION}-alpine-amd64 AS dotnet-sdk-builder

WORKDIR /build
COPY invoke-runtime/sdks/dotnet/ ./
RUN dotnet pack Invoke.SDK/Invoke.SDK.csproj -c Release -o /out

# ============ Build rootfs ============
FROM bun-base AS rootfs

ARG DOTNET_VERSION
RUN apk add --no-cache icu-libs tzdata bash clang build-base zlib-dev && \
    curl -fsSL "https://dot.net/v1/dotnet-install.sh" -o /tmp/dotnet-install.sh && \
    chmod +x /tmp/dotnet-install.sh && \
    /tmp/dotnet-install.sh --channel ${DOTNET_VERSION} --install-dir /usr/lib/dotnet --os linux-musl && \
    ln -sf /usr/lib/dotnet/dotnet /usr/local/bin/dotnet && \
    ln -sf /usr/lib/dotnet/dnx /usr/local/bin/dnx && \
    rm -f /tmp/dotnet-install.sh && \
    apk del bash

# Copy the worker shim files built in the worker-builder stage.
COPY --from=worker-builder /opt/invoke/dist/ /opt/invoke
RUN chmod 755 /opt/invoke/worker

# --- Packages for function builds (invoke-types + Invoke.SDK) ---
RUN mkdir -p /opt/packages/npm && \
    mkdir -p /opt/packages/nuget
COPY --from=invoke-types-builder /opt/invoke-runtime/types/invoke-types-*.tgz /opt/packages/npm/invoke-types.tgz
COPY --from=dotnet-sdk-builder /out/ /opt/packages/nuget/

RUN mkdir -p /dev/shm /run /tmp /proc /sys && \
    chmod 777 /tmp && \
    chmod 755 /dev && \
    chmod 777 /dev/shm

# ============ Final runtime image ============
FROM alpine:3

# libstdc++ and libgcc are needed by the supervisor binary (C++20).
RUN apk add --no-cache libstdc++ libgcc

# --- Supervisor binary ---
COPY --from=supervisor-builder /build/builddir/invoke-supervisor /usr/local/bin/invoke-supervisor
RUN chmod 755 /usr/local/bin/invoke-supervisor && \
    mkdir -p /opt/inv

# --- Build /opt/rootfs (the chroot environment for user functions) ---
# Copy only the minimal files Bun needs to run inside the chroot.
COPY --from=rootfs --link / /opt/rootfs/

ENTRYPOINT ["/usr/local/bin/invoke-supervisor"]
