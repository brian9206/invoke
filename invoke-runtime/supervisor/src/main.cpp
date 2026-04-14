// ============================================================================
// main.cpp — Entrypoint for invoke-supervisor
// ============================================================================

#include "supervisor.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

static const char* env_or(const char* name, const char* fallback) {
    const char* val = std::getenv(name);
    return (val && val[0]) ? val : fallback;
}

bool g_instrument = false;

int main() {
    invoke::SupervisorConfig config;

    config.socket_path     = env_or("INVOKE_SOCKET_PATH", "/run/events.sock");
    config.bun_path        = env_or("INVOKE_BUN_PATH", "/usr/local/bin/bun");
    config.rootfs_path     = env_or("INVOKE_ROOTFS_PATH", "/opt/rootfs");
    config.tmpfs_mb        = std::atoi(env_or("SANDBOX_TMPFS_MB", "64"));
    config.worker_uid      = std::atoi(env_or("INVOKE_WORKER_UID", "65534"));
    config.worker_gid      = std::atoi(env_or("INVOKE_WORKER_GID", "65534"));
    config.default_memory_mb = std::atoi(env_or("SANDBOX_MEMORY_MB", "256"));

    const char* inv_instrument = std::getenv("INVOKE_INSTRUMENT");
    config.instrument = (inv_instrument && std::strcmp(inv_instrument, "true") == 0);
    g_instrument = config.instrument;

    std::fprintf(stdout, "[supervisor] Starting invoke-supervisor\n");
    std::fprintf(stdout, "[supervisor]   socket:   %s\n", config.socket_path.c_str());
    std::fprintf(stdout, "[supervisor]   rootfs:   %s\n", config.rootfs_path.c_str());
    std::fprintf(stdout, "[supervisor]   bun:      %s\n", config.bun_path.c_str());
    std::fprintf(stdout, "[supervisor]   tmpfs:    %d MB\n", config.tmpfs_mb);
    std::fprintf(stdout, "[supervisor]   uid/gid:  %d/%d\n", config.worker_uid, config.worker_gid);

    invoke::supervisor_run(config);

    return 0;
}
