#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# DIND entrypoint — starts the inner Docker daemon, waits for it to be ready,
# then hands off to the application.
#
# Environment variables:
#   GVISOR_PLATFORM  — gVisor platform passed to runsc (default: ptrace).
#                      Use "kvm" for better performance when /dev/kvm is
#                      available (requires privileged + /dev/kvm device).
# ---------------------------------------------------------------------------

GVISOR_PLATFORM="${GVISOR_PLATFORM:-ptrace}"

# Patch the runsc runtime args in daemon.json with the chosen platform so
# we don't have to bake it into the image at build time.
DAEMON_JSON=/etc/docker/daemon.json
PATCHED=$(cat "$DAEMON_JSON" | \
  sed "s|\"path\": \"/usr/local/bin/runsc\"|\"path\": \"/usr/local/bin/runsc\", \"runtimeArgs\": [\"--platform=${GVISOR_PLATFORM}\", \"--host-uds=open\", \"--network=sandbox\"]|")
echo "$PATCHED" > "$DAEMON_JSON"

echo "[entrypoint] Starting Docker daemon (gVisor platform: ${GVISOR_PLATFORM})..."

# Start dockerd in the background; use overlay2 storage driver.
dockerd \
  --init \
  --host=unix:///var/run/docker.sock \
  --storage-driver=overlay2 \
  --log-driver=none \
  --seccomp-profile=unconfined \
  --default-ulimit nofile=1024:4096 \
  --userland-proxy=false \
  2>&1 &

DOCKERD_PID=$!

# Wait up to 60 s for the daemon to become responsive.
i=0
while ! docker info >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[entrypoint] Docker daemon did not start within 60 s — aborting."
    exit 1
  fi
  if ! kill -0 "$DOCKERD_PID" 2>/dev/null; then
    echo "[entrypoint] Docker daemon process exited unexpectedly."
    exit 1
  fi
  sleep 1
done

echo "[entrypoint] Docker daemon is ready."

export DOCKER_BUILDKIT=1
docker build -t $RUNTIME_IMAGE -f /app/invoke-runtime/Dockerfile /app

exec "$@"
