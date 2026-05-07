// ============================================================================
// Supervisor — Main event loop and orchestration
// ============================================================================
#pragma once

#include <string>
#include <cstdio>

/// Global instrument flag — set once in main() from INVOKE_INSTRUMENT env var.
extern bool g_instrument;

/// Emit a log line to stderr only when INVOKE_INSTRUMENT=true.
#define ILOG(...) do { if (g_instrument) { std::fprintf(stderr, __VA_ARGS__); } } while (0)

namespace invoke {

/// Configuration for the supervisor.
struct SupervisorConfig {
    std::string socket_path   = "/run/events.sock";
    std::string rootfs_path   = "/opt/rootfs";
    int         tmpfs_mb      = 64;
    int         worker_uid    = 65534;
    int         worker_gid    = 65534;
    int         default_memory_mb = 256;
    bool        instrument    = false;
};

/// Run the supervisor event loop. Blocks until shutdown.
/// 1. Connects to host socket
/// 2. Sends "ready", processes "execute" events, sends "ready" after each
void supervisor_run(const SupervisorConfig& config);

/// Run a debug interactive shell inside the sandbox environment.
/// Called when the supervisor is launched with the --debug argument.
/// Sets up the overlay filesystem, drops into /bin/sh as root, and cleans
/// up on exit. Does not connect to the host IPC socket.
void supervisor_run_debug(const SupervisorConfig& config);

} // namespace invoke
