// ============================================================================
// Cgroup — cgroup v2 memory limit management
// ============================================================================
#pragma once

#include <cstdint>
#include <string>
#include <sys/types.h>

namespace invoke {

/// Base path for supervisor cgroups. Created once at startup.
constexpr const char* CGROUP_BASE = "/sys/fs/cgroup/invoke";

/// Ensure the base cgroup directory exists and memory controller is enabled.
/// Must be called once before any per-invocation cgroups.
bool cgroup_init();

/// Create a child cgroup for a single invocation and set memory.max.
/// Path: /sys/fs/cgroup/invoke/<invocation_id>/
bool cgroup_create(const std::string& invocation_id, uint64_t memory_bytes);

/// Move an explicit PID into the invocation cgroup.
/// Must be called from the parent (supervisor) after clone(), passing
/// the child PID in the parent namespace — never from inside CLONE_NEWPID.
bool cgroup_add_pid(const std::string& invocation_id, pid_t pid);

/// Destroy a per-invocation cgroup by waiting for cgroup.events to report
/// populated 0, then removing the directory.
bool cgroup_destroy(const std::string& invocation_id);

} // namespace invoke
