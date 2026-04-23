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

/// Mount tmpfs + overlayfs for one invocation, or use persistent directory.
///   sandbox_dir:   /opt/inv/<invocationId>
///   lower_dir:     path to function code (e.g. /functions/<funcId>)
///   rootfs:        path to base rootfs (e.g. /opt/rootfs)
///   use_tmpfs:     if true, mount tmpfs for writable layer; if false, use build_rw_dir
///   tmpfs_mb:      tmpfs size in MB (ignored if use_tmpfs=false)
///   build_rw_dir:  persistent writable layer directory (ignored if use_tmpfs=true)
bool sandbox_setup_fs(const std::string& sandbox_dir,
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
pid_t sandbox_start_worker(const std::string& sandbox_dir,
                           const std::string& invocation_id,
                           const std::string& entry,
                           uint64_t memory_bytes,
                           int uid, int gid,
                           const std::vector<std::string>& extra_env = {});

/// Spawn the worker and block until it exits.
///   Equivalent to sandbox_start_worker() + waitpid().
///   extra_env: additional "KEY=VALUE" strings appended to the base envp.
///   Returns child exit code (0 = success), or -1 on error.
int sandbox_spawn_worker(const std::string& sandbox_dir,
                         const std::string& invocation_id,
                         const std::string& entry,
                         uint64_t memory_bytes,
                         int uid, int gid,
                         const std::vector<std::string>& extra_env = {});

/// Clean up mounts and directories for one invocation.
void sandbox_cleanup(const std::string& sandbox_dir, const std::string& invocation_id);

/// Set up a minimal build sandbox:
///   - /tmp  : tmpfs (tmpfs_mb size)
///   - /app  : read-only bind mount to source_dir
///   - /output: read-write bind mount to output_dir
///   sandbox_dir:  /opt/inv/bld-<id>  (will be created/used as chroot)
///   source_dir:   directory with source files to bind into /app (ro)
///   output_dir:   directory to bind into /output (rw, receives build artifacts)
///   rootfs:       path to base rootfs
bool sandbox_setup_build_fs(const std::string& sandbox_dir,
                             const std::string& source_dir,
                             const std::string& output_dir,
                             const std::string& rootfs,
                             int tmpfs_mb = 256);

/// Clean up build sandbox mounts and directories.
void sandbox_cleanup_build(const std::string& sandbox_dir, const std::string& invocation_id);

} // namespace invoke
