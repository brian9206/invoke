// ============================================================================
// Sandbox — Per-invocation filesystem + namespace isolation implementation
// ============================================================================

#include "sandbox.h"
#include "cgroup.h"
#include "protocol.h"
#include "supervisor.h"

#include <cerrno>
#include <chrono>
#include <climits>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <dirent.h>
#include <fcntl.h>
#include <sched.h>
#include <signal.h>
#include <sys/mount.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <sys/types.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <unistd.h>

namespace invoke {

static std::string g_last_setup_error;

const std::string& sandbox_last_setup_error() {
    return g_last_setup_error;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

static constexpr const char* INV_BASE = "/opt/inv";

// Stack size for clone'd child
static constexpr size_t CHILD_STACK_SIZE = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static bool mkdirp(const std::string& path, mode_t mode = 0755) {
    if (::mkdir(path.c_str(), mode) == 0) return true;
    if (errno == EEXIST) return true;

    // Try creating parents
    auto slash = path.rfind('/');
    if (slash != std::string::npos && slash > 0) {
        if (!mkdirp(path.substr(0, slash), mode)) return false;
        if (::mkdir(path.c_str(), mode) == 0) return true;
        if (errno == EEXIST) return true;
    }
    return false;
}

/// Recursively remove a directory tree (rm -rf equivalent).
static void rmtree(const std::string& path) {
    DIR* d = opendir(path.c_str());
    if (!d) {
        ::unlink(path.c_str());
        return;
    }
    struct dirent* ent;
    while ((ent = readdir(d)) != nullptr) {
        if (std::strcmp(ent->d_name, ".") == 0 || std::strcmp(ent->d_name, "..") == 0)
            continue;
        auto child = path + "/" + ent->d_name;
        if (ent->d_type == DT_DIR) {
            rmtree(child);
        } else {
            ::unlink(child.c_str());
        }
    }
    closedir(d);
    ::rmdir(path.c_str());
}

// ---------------------------------------------------------------------------
// Child process argument block (passed through clone)
// ---------------------------------------------------------------------------

struct ChildArgs {
    const char* merged_dir;
    const char* invocation_id;
    int         uid;
    int         gid;
    // execve argv (null-terminated)
    const char* worker_path;
    const char* entry;
    // execve envp (null-terminated, built by parent)
    const char* const* envp;
};

static int child_fn(void* arg) {
    auto child_start = std::chrono::high_resolution_clock::now();
    auto* a = static_cast<ChildArgs*>(arg);

    ILOG("[child_fn] starting (merged_dir=%s)\n", a->merged_dir);

    // NOTE: cgroup_join is NOT called here because we're in a CLONE_NEWPID namespace.
    // ::getpid() returns 1 in this namespace, but would register the wrong PID in the
    // parent namespace's cgroup. Instead, the parent process adds us to the cgroup.

    // 2. chroot into the overlay merged directory
    auto chroot_start = std::chrono::high_resolution_clock::now();
    if (::chroot(a->merged_dir) < 0) {
        std::perror("[worker-child] chroot");
        _exit(126);
    }
    auto chroot_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - chroot_start).count();
    ILOG("[child_fn] chroot took %ldms\n", chroot_ms);

    // 3. chdir to /app — the function code working directory
    auto chdir_start = std::chrono::high_resolution_clock::now();
    if (::chdir("/app") < 0) {
        std::perror("[worker-child] chdir");
        _exit(126);
    }
    auto chdir_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - chdir_start).count();
    ILOG("[child_fn] chdir took %ldms\n", chdir_ms);

    // 3b. Mount /proc for the new PID namespace (safe: CLONE_NEWPID means only
    // the worker itself is visible at PID 1). Bun reads /proc/self/exe to find
    // its own binary path for node-compatibility shim creation.
    if (::mount("proc", "/proc", "proc", MS_NOSUID | MS_NODEV | MS_NOEXEC, nullptr) < 0) {
        std::perror("[worker-child] mount proc");
        _exit(126);
    }

    // 3c. Populate the minimal device nodes
    // Bun/JSC needs at startup (primarily /dev/urandom for PRNG seeding).
    ::mknod("/dev/null",    S_IFCHR | 0666, makedev(1, 3));
    ::mknod("/dev/zero",    S_IFCHR | 0666, makedev(1, 5));
    ::mknod("/dev/random",  S_IFCHR | 0444, makedev(1, 8));
    ::mknod("/dev/urandom", S_IFCHR | 0444, makedev(1, 9));
    ::mknod("/dev/tty",     S_IFCHR | 0666, makedev(5, 0));

    // 4. Drop privileges: gid first, then uid
    auto privdrop_start = std::chrono::high_resolution_clock::now();
    if (::setgid(static_cast<gid_t>(a->gid)) < 0) {
        std::perror("[worker-child] setgid");
        _exit(126);
    }
    if (::setuid(static_cast<uid_t>(a->uid)) < 0) {
        std::perror("[worker-child] setuid");
        _exit(126);
    }
    auto privdrop_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - privdrop_start).count();
    ILOG("[child_fn] setgid+setuid took %ldms\n", privdrop_ms);

    // 5. Build argv for execve
    const char* argv_no_instr[] = {
        a->worker_path, a->entry, nullptr,
    };
    const char* argv_with_instr[] = {
        a->worker_path, a->entry, "--instrument", nullptr,
    };
    const char* const* argv =
        g_instrument ? argv_with_instr : argv_no_instr;

    // 6. Build minimal envp — provided by the caller (supervisor builds it from
    // the execute event payload and the required base vars).

    auto child_setup_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - child_start).count();
    ILOG("[child_fn] setup complete in %ldms, about to execve bun\n", child_setup_ms);

    // 7. execve
    ::execve(a->worker_path, const_cast<char* const*>(argv), const_cast<char* const*>(a->envp));

    // Only reached on error
    std::perror("[worker-child] execve");
    _exit(127);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

SandboxPaths sandbox_paths(const std::string& invocation_id) {
    SandboxPaths p;
    p.inv_dir    = std::string(INV_BASE) + "/" + invocation_id;
    p.rw_dir     = p.inv_dir + "/rw";
    p.merged_dir = p.inv_dir + "/merged";
    return p;
}

bool sandbox_setup_fs(const SandboxPaths& paths,
                      const std::string& lower_dir,
                      const std::string& rootfs,
                      int tmpfs_mb) {
    g_last_setup_error.clear();

    auto fs_start = std::chrono::high_resolution_clock::now();

    struct stat st{};
    if (::stat(lower_dir.c_str(), &st) < 0) {
        g_last_setup_error = "lowerdir missing or inaccessible: " + lower_dir + " (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    if (::stat(rootfs.c_str(), &st) < 0) {
        g_last_setup_error = "rootfs missing or inaccessible: " + rootfs + " (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }

    // Create base directories
    if (!mkdirp(paths.rw_dir) || !mkdirp(paths.merged_dir)) {
        g_last_setup_error = "failed to create invocation directories under " + paths.inv_dir;
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }

    // Mount tmpfs for writable layer
    // tmpfs data only accepts tmpfs-specific options (size, mode, uid, gid, ...).
    // nosuid/noexec must be provided as mount flags, not in the data string.
    auto tmpfs_opts = "size=" + std::to_string(tmpfs_mb) + "m,mode=777";
    ILOG("[sandbox_setup_fs] mounting tmpfs at %s with options %s\n", paths.rw_dir.c_str(), tmpfs_opts.c_str());
    auto tmpfs_start = std::chrono::high_resolution_clock::now();
    if (::mount("tmpfs", paths.rw_dir.c_str(), "tmpfs",
                MS_NOSUID | MS_NOEXEC, tmpfs_opts.c_str()) < 0) {
        g_last_setup_error = "mount tmpfs failed at " + paths.rw_dir + " (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    auto tmpfs_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - tmpfs_start).count();
    ILOG("[sandbox_setup_fs] tmpfs mount took %ldms\n", tmpfs_ms);

    // Create upper/work on the tmpfs
    ILOG("[sandbox_setup_fs] creating upper/work dirs\n");
    if (!mkdirp(paths.rw_dir + "/root_upper") || !mkdirp(paths.rw_dir + "/root_work")) {
        g_last_setup_error = "failed to create upper/work dirs on tmpfs";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    ILOG("[sandbox_setup_fs] upper/work dirs created\n");

    // Mount overlayfs: lowerdir = rootfs only. Function code is bind-mounted
    // separately at /app so it appears at a predictable, isolated path.
    auto overlay_opts = "lowerdir=" + rootfs +
                        ",upperdir=" + paths.rw_dir + "/root_upper" +
                        ",workdir=" + paths.rw_dir + "/root_work";
    ILOG("[sandbox_setup_fs] mounting overlay at %s with options %s\n", paths.merged_dir.c_str(), overlay_opts.c_str());
    auto overlay_start = std::chrono::high_resolution_clock::now();
    if (::mount("overlay", paths.merged_dir.c_str(), "overlay",
                MS_NOSUID, overlay_opts.c_str()) < 0) {
        g_last_setup_error = "mount overlay failed at " + paths.merged_dir + " (" + std::string(std::strerror(errno)) + "), opts=" + overlay_opts;
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    auto overlay_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - overlay_start).count();
    ILOG("[sandbox_setup_fs] overlay mount took %ldms\n", overlay_ms);

    // Mount a nested overlay at /app for the function code
    // This allows /app to be writable (writes go to tmpfs upper layer)
    // while the function code (lower_dir) remains unmodified on the host    
    if (!mkdirp(paths.merged_dir + "/app") || !mkdirp(paths.rw_dir + "/app_upper") || !mkdirp(paths.rw_dir + "/app_work")) {
        g_last_setup_error = "failed to create /app dirs";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    
    ILOG("[sandbox_setup_fs] mounting nested overlay at /app (lowerdir=%s)\n", lower_dir.c_str());
    auto app_overlay_opts = "lowerdir=" + lower_dir +
                            ",upperdir=" + paths.rw_dir + "/app_upper" +
                            ",workdir=" + paths.rw_dir + "/app_work";
    if (::mount("overlay", (paths.merged_dir + "/app").c_str(), "overlay",
                MS_NOSUID, app_overlay_opts.c_str()) < 0) {
        g_last_setup_error = "mount nested overlay at /app failed (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    ILOG("[sandbox_setup_fs] nested overlay at /app mounted\n");

    // chmod /app to 777 so the worker can write files
    if (::chmod((paths.merged_dir + "/app").c_str(), 0777) < 0) {
        g_last_setup_error = "chmod /app failed (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    ILOG("[sandbox_setup_fs] /app permissions set to 777\n");

    // Bind mount /run/events.sock into the sandbox for event communication back to the supervisor
    auto events_socket_host = "/run/events.sock";
    auto events_socket_jail = paths.merged_dir + "/run/events.sock";
    ILOG("[sandbox_setup_fs] creating /run directory in merged dir\n");
    if (!mkdirp(paths.merged_dir + "/run")) {
        g_last_setup_error = "failed to create /run in merged dir for socket bind mount";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    ILOG("[sandbox_setup_fs] creating socket bind mount target file\n");
    // Bind mount requires the target to be a pre-existing file (not just the directory).
    // Touch an empty file at the target path to serve as the mount point.
    {
        int tfd = ::open(events_socket_jail.c_str(), O_CREAT | O_WRONLY, 0600);
        if (tfd < 0) {
            g_last_setup_error = "failed to create socket bind mount target at " + events_socket_jail + " (" + std::string(std::strerror(errno)) + ")";
            std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
            return false;
        }
        ::close(tfd);
    }
    ILOG("[sandbox_setup_fs] binding mount %s to %s\n", events_socket_host, events_socket_jail.c_str());
    auto bind_start = std::chrono::high_resolution_clock::now();
    if (::mount(events_socket_host, events_socket_jail.c_str(), nullptr, MS_BIND | MS_SHARED, nullptr) < 0) {
        g_last_setup_error = "bind mount of events.sock failed at " + events_socket_jail + " (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    auto bind_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - bind_start).count();
    ILOG("[sandbox_setup_fs] socket bind mount took %ldms\n", bind_ms);

    // Bind mount /etc/resolv.conf so DNS works inside the chroot.
    // The container's /etc/resolv.conf is Docker-injected at runtime and is not
    // present in the rootfs image copied to /opt/rootfs, so we need to expose it.
    {
        auto resolv_jail = paths.merged_dir + "/etc/resolv.conf";
        // Ensure /etc exists inside the merged dir (it should, but be safe)
        mkdirp(paths.merged_dir + "/etc");
        // Create the target file if it doesn't already exist in the overlay
        int rfd = ::open(resolv_jail.c_str(), O_CREAT | O_WRONLY, 0644);
        if (rfd >= 0) ::close(rfd);
        if (::mount("/etc/resolv.conf", resolv_jail.c_str(), nullptr, MS_BIND | MS_RDONLY, nullptr) < 0) {
            std::fprintf(stderr, "[sandbox_setup_fs] warning: resolv.conf bind mount failed (%s) — DNS may not work\n",
                         std::strerror(errno));
            // Non-fatal: the sandbox can still run, just without external DNS.
        } else {
            ILOG("[sandbox_setup_fs] resolv.conf bind mounted\n");
        }
    }

    auto total_fs_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - fs_start).count();
    ILOG("[sandbox_setup_fs] TOTAL: %ldms (tmpfs=%ldms, overlay=%ldms, bind=%ldms)\n",
         total_fs_ms, tmpfs_ms, overlay_ms, bind_ms);

    return true;
}

pid_t sandbox_start_worker(const SandboxPaths& paths,
                           const std::string& invocation_id,
                           const std::string& entry,
                           uint64_t memory_bytes,
                           int uid, int gid,
                           const std::vector<std::string>& extra_env) {
    // 1. Create cgroup for this invocation
    auto cgroup_start = std::chrono::high_resolution_clock::now();
    if (!cgroup_create(invocation_id, memory_bytes)) {
        std::fprintf(stderr, "[sandbox] Failed to create cgroup for %s\n", invocation_id.c_str());
        // Continue without cgroup — non-fatal
    }
    auto cgroup_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - cgroup_start).count();
    ILOG("[spawn_worker] cgroup_create took %ldms\n", cgroup_ms);

    // 2. Prepare child args
    ChildArgs args{};
    args.merged_dir    = paths.merged_dir.c_str();
    args.invocation_id = invocation_id.c_str();
    args.uid           = uid;
    args.gid           = gid;
    args.worker_path   = "/opt/shim/worker";
    args.entry         = entry.c_str();

    // 3. Build envp: base vars required by Bun + caller-supplied user vars.
    // The strings and pointer array must outlive the child execve call.
    // CLONE_VFORK guarantees the parent is suspended until the child execs,
    // so locals allocated here remain valid for the child.
    static const char* const base_vars[] = {
        "HOME=/tmp",
        "TMPDIR=/tmp",
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "TZ=UTC",
        "BUN_JSC_maxPerThreadStackUsage=524288",    // --smol
    };
    static constexpr std::size_t BASE_COUNT = sizeof(base_vars) / sizeof(base_vars[0]);

    std::vector<const char*> envp_vec;
    envp_vec.reserve(BASE_COUNT + extra_env.size() + 1);
    for (std::size_t i = 0; i < BASE_COUNT; ++i)
        envp_vec.push_back(base_vars[i]);
    for (const auto& s : extra_env)
        envp_vec.push_back(s.c_str());
    envp_vec.push_back(nullptr);
    args.envp = envp_vec.data();

    // 4. Allocate stack for clone
    auto* stack = static_cast<char*>(std::malloc(CHILD_STACK_SIZE));
    if (!stack) {
        std::perror("[sandbox] malloc stack");
        cgroup_destroy(invocation_id);
        return -1;
    }
    // Stack grows downward
    char* stack_top = stack + CHILD_STACK_SIZE;

    // 4. Clone with new PID, mount, and UTS namespaces.
    // CLONE_NEWNS gives the child its own mount namespace so that the /proc and
    // /dev mounts inside child_fn don't leak back into the supervisor's view.
    ILOG("[spawn_worker] calling clone...\n");
    auto clone_start = std::chrono::high_resolution_clock::now();
    int clone_flags = CLONE_VM | CLONE_VFORK | CLONE_NEWPID | CLONE_NEWNS | SIGCHLD;
    pid_t child_pid = clone(child_fn, stack_top, clone_flags, &args);
    auto clone_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - clone_start).count();
    ILOG("[spawn_worker] clone + child_fn returned in %ldms (pid=%d)\n", clone_ms, child_pid);

    if (child_pid < 0) {
        std::fprintf(stderr, "[sandbox] clone: %s\n", std::strerror(errno));
        std::free(stack);
        cgroup_destroy(invocation_id);
        return -1;
    }

    // Add the child process to its cgroup using the actual child PID (not the namespace PID).
    // This MUST be done from the parent — inside CLONE_NEWPID, getpid() returns 1 which
    // would accidentally move the supervisor into the invocation cgroup.
    auto cgroup_add_start = std::chrono::high_resolution_clock::now();
    cgroup_add_pid(invocation_id, child_pid);
    auto cgroup_add_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - cgroup_add_start).count();
    ILOG("[spawn_worker] cgroup_add_pid took %ldms\n", cgroup_add_ms);

    // Stack is safe to free: CLONE_VFORK guarantees the child has called execve (or _exit),
    // so the parent's VM is fully restored.
    std::free(stack);

    ILOG("[spawn_worker] worker started (pid=%d, cgroup=%ldms, clone=%ldms, cgroup_add=%ldms)\n",
         child_pid, cgroup_ms, clone_ms, cgroup_add_ms);
    return child_pid;
}

int sandbox_spawn_worker(const SandboxPaths& paths,
                         const std::string& invocation_id,
                         const std::string& entry,
                         uint64_t memory_bytes,
                         int uid, int gid,
                         const std::vector<std::string>& extra_env) {
    auto spawn_start = std::chrono::high_resolution_clock::now();

    pid_t child_pid = sandbox_start_worker(paths, invocation_id, entry, memory_bytes, uid, gid, extra_env);
    if (child_pid < 0) return -1;

    ILOG("[spawn_worker] waiting for child (pid %d) to exit...\n", child_pid);
    auto wait_start = std::chrono::high_resolution_clock::now();
    int status = 0;
    while (::waitpid(child_pid, &status, 0) < 0) {
        if (errno != EINTR) {
            std::perror("[sandbox] waitpid");
            break;
        }
    }
    auto wait_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - wait_start).count();
    ILOG("[spawn_worker] waitpid took %ldms (status=%d)\n", wait_ms, status);

    auto total_spawn_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - spawn_start).count();
    ILOG("[spawn_worker] TOTAL: %ldms (wait=%ldms)\n", total_spawn_ms, wait_ms);

    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    } else if (WIFSIGNALED(status)) {
        std::fprintf(stderr, "[sandbox] Worker killed by signal %d\n", WTERMSIG(status));
        return 128 + WTERMSIG(status);
    }
    return -1;
}

void sandbox_cleanup(const SandboxPaths& paths, const std::string& invocation_id) {
    ILOG("[sandbox_cleanup] starting cleanup for %s\n", invocation_id.c_str());

    // Lazy-unmount the socket bind mount first (it sits inside merged_dir)
    auto events_socket_jail = paths.merged_dir + "/run/events.sock";
    ILOG("[sandbox_cleanup] unmounting socket at %s\n", events_socket_jail.c_str());
    if (::umount2(events_socket_jail.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 events.sock(%s): %s\n",
                     events_socket_jail.c_str(), std::strerror(errno));
    }
    ILOG("[sandbox_cleanup] socket unmounted\n");

    // Lazy-unmount nested /app overlay before the main overlay
    auto app_jail = paths.merged_dir + "/app";
    ILOG("[sandbox_cleanup] unmounting nested /app overlay at %s\n", app_jail.c_str());
    if (::umount2(app_jail.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 /app overlay(%s): %s\n",
                     app_jail.c_str(), std::strerror(errno));
    }
    ILOG("[sandbox_cleanup] /app overlay unmounted\n");

    // Lazy-unmount main overlay
    ILOG("[sandbox_cleanup] unmounting main overlay at %s\n", paths.merged_dir.c_str());
    if (::umount2(paths.merged_dir.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 overlay(%s): %s\n",
                     paths.merged_dir.c_str(), std::strerror(errno));
    }
    ILOG("[sandbox_cleanup] main overlay unmounted\n");

    // Lazy-unmount tmpfs
    ILOG("[sandbox_cleanup] unmounting tmpfs at %s\n", paths.rw_dir.c_str());
    if (::umount2(paths.rw_dir.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 tmpfs(%s): %s\n",
                     paths.rw_dir.c_str(), std::strerror(errno));
    }
    ILOG("[sandbox_cleanup] tmpfs unmounted\n");

    // Remove directory tree
    ILOG("[sandbox_cleanup] removing directory tree %s\n", paths.inv_dir.c_str());
    rmtree(paths.inv_dir);
    ILOG("[sandbox_cleanup] directory tree removed\n");

    // Destroy cgroup
    ILOG("[sandbox_cleanup] destroying cgroup for %s\n", invocation_id.c_str());
    cgroup_destroy(invocation_id);
    ILOG("[sandbox_cleanup] cgroup destroyed\n");
}

} // namespace invoke
