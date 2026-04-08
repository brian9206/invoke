// ============================================================================
// Supervisor — Main event loop and orchestration
// ============================================================================
#pragma once

#include <string>

namespace invoke {

/// Configuration for the supervisor.
struct SupervisorConfig {
    std::string socket_path   = "/run/events.sock";
    std::string bun_path      = "/usr/local/bin/bun";
    std::string rootfs_path   = "/opt/rootfs";
    int         tmpfs_mb      = 64;
    int         worker_uid    = 65534;
    int         worker_gid    = 65534;
    int         default_memory_mb = 256;
};

/// Run the supervisor event loop. Blocks until shutdown.
/// 1. Connects to host socket
/// 2. Sends "ready", processes "execute" events, sends "ready" after each
void supervisor_run(const SupervisorConfig& config);

} // namespace invoke
