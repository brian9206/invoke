// ============================================================================
// Sandbox — Per-invocation filesystem + namespace isolation via clone/execve
// ============================================================================
#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace invoke {

using json = nlohmann::json;

/// Paths created for a single invocation sandbox.
struct SandboxPaths {
    std::string inv_dir;    // /opt/inv/<invocationId>
    std::string rw_dir;     // /opt/inv/<invocationId>/rw
    std::string upper_dir;  // /opt/inv/<invocationId>/rw/upper
    std::string work_dir;   // /opt/inv/<invocationId>/rw/work
    std::string merged_dir; // /opt/inv/<invocationId>/merged
};

/// Build the SandboxPaths for a given invocation.
SandboxPaths sandbox_paths(const std::string& invocation_id);

/// Mount tmpfs + overlayfs for one invocation.
///   lower_dir: path to function code (e.g. /functions/<funcId>)
///   rootfs:    path to base rootfs (e.g. /opt/rootfs)
///   tmpfs_mb:  tmpfs size in MB
bool sandbox_setup_fs(const SandboxPaths& paths,
                      const std::string& lower_dir,
                      const std::string& rootfs,
                      int tmpfs_mb);

/// Return the last sandbox setup error message from sandbox_setup_fs.
const std::string& sandbox_last_setup_error();

/// Spawn the worker inside the sandbox and return immediately after the child
/// has exec'd. The caller is responsible for waiting on the returned PID.
///   - Child: joins cgroup, chroots, drops privileges, execve's bun.
///   - Parent: returns child PID without waiting.
///   extra_env: additional "KEY=VALUE" strings appended to the base envp.
///   Returns child PID (> 0) on success, or -1 on error.
pid_t sandbox_start_worker(const SandboxPaths& paths,
                           const std::string& invocation_id,
                           const std::string& entry,
                           uint64_t memory_bytes,
                           int uid, int gid,
                           const std::vector<std::string>& extra_env = {});

/// Spawn the worker and block until it exits.
///   Equivalent to sandbox_start_worker() + waitpid().
///   extra_env: additional "KEY=VALUE" strings appended to the base envp.
///   Returns child exit code (0 = success), or -1 on error.
int sandbox_spawn_worker(const SandboxPaths& paths,
                         const std::string& invocation_id,
                         const std::string& entry,

                         uint64_t memory_bytes,
                         int uid, int gid,
                         const std::vector<std::string>& extra_env = {});

/// Clean up mounts and directories for one invocation.
void sandbox_cleanup(const SandboxPaths& paths, const std::string& invocation_id);

} // namespace invoke
