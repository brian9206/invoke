// ============================================================================
// Sandbox — Per-invocation filesystem + namespace isolation implementation
// ============================================================================

#include "sandbox.h"
#include "cgroup.h"
#include "protocol.h"

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
    const char* bun_path;
    const char* worker_script;
    const char* entry;
};

static int child_fn(void* arg) {
    auto child_start = std::chrono::high_resolution_clock::now();
    auto* a = static_cast<ChildArgs*>(arg);

    std::fprintf(stderr, "[child_fn] starting (merged_dir=%s)\n", a->merged_dir);

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
    std::fprintf(stderr, "[child_fn] chroot took %ldms\n", chroot_ms);

    // 3. chdir to new root
    auto chdir_start = std::chrono::high_resolution_clock::now();
    if (::chdir("/") < 0) {
        std::perror("[worker-child] chdir");
        _exit(126);
    }
    auto chdir_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - chdir_start).count();
    std::fprintf(stderr, "[child_fn] chdir took %ldms\n", chdir_ms);

    // 3b. Mount /proc for the new PID namespace (safe: CLONE_NEWPID means only
    // the worker itself is visible at PID 1). Bun reads /proc/self/exe to find
    // its own binary path for node-compatibility shim creation.
    if (::mount("proc", "/proc", "proc", MS_NOSUID | MS_NODEV | MS_NOEXEC, nullptr) < 0) {
        std::perror("[worker-child] mount proc");
        _exit(126);
    }

    // 3c. Mount a fresh tmpfs at /dev and populate the minimal device nodes
    // Bun/JSC needs at startup (primarily /dev/urandom for PRNG seeding).
    if (::mount("tmpfs", "/dev", "tmpfs", MS_NOSUID | MS_NOEXEC, "size=1m,mode=755") == 0) {
        ::mknod("/dev/null",    S_IFCHR | 0666, makedev(1, 3));
        ::mknod("/dev/zero",    S_IFCHR | 0666, makedev(1, 5));
        ::mknod("/dev/random",  S_IFCHR | 0444, makedev(1, 8));
        ::mknod("/dev/urandom", S_IFCHR | 0444, makedev(1, 9));
        ::mknod("/dev/tty",     S_IFCHR | 0666, makedev(5, 0));
    } else {
        std::perror("[worker-child] mount /dev tmpfs");
        /* non-fatal — Bun may crash without /dev/urandom, but let it try */
    }

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
    std::fprintf(stderr, "[child_fn] setgid+setuid took %ldms\n", privdrop_ms);

    // 5. Build argv for execve
    const char* argv[] = {
        "bun",
        "--smol",
        "--no-install",
        "--no-pkg-config",
        a->worker_script,   // "/opt/shim/dist/worker-main.js"
        a->entry,           // "<entry_basename>"
        nullptr,
    };

    // 6. Build minimal envp — user env is injected via IPC payload, not process env.
    // Provide the minimum vars Bun needs to initialize correctly.
    const char* envp[] = {
        "HOME=/tmp",
        "TMPDIR=/tmp",
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "TZ=UTC",
        nullptr,
    };

    auto child_setup_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - child_start).count();
    std::fprintf(stderr, "[child_fn] setup complete in %ldms, about to execve bun\n", child_setup_ms);

    // 7. execve
    ::execve(a->bun_path, const_cast<char* const*>(argv), const_cast<char* const*>(envp));

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
    p.upper_dir  = p.rw_dir + "/upper";
    p.work_dir   = p.rw_dir + "/work";
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
    auto tmpfs_opts = "size=" + std::to_string(tmpfs_mb) + "m";
    std::fprintf(stderr, "[sandbox_setup_fs] mounting tmpfs at %s with options %s\n", paths.rw_dir.c_str(), tmpfs_opts.c_str());
    auto tmpfs_start = std::chrono::high_resolution_clock::now();
    if (::mount("tmpfs", paths.rw_dir.c_str(), "tmpfs",
                MS_NOSUID | MS_NOEXEC, tmpfs_opts.c_str()) < 0) {
        g_last_setup_error = "mount tmpfs failed at " + paths.rw_dir + " (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    auto tmpfs_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - tmpfs_start).count();
    std::fprintf(stderr, "[sandbox_setup_fs] tmpfs mount took %ldms\n", tmpfs_ms);

    // Create upper/work on the tmpfs
    std::fprintf(stderr, "[sandbox_setup_fs] creating upper/work dirs\n");
    if (!mkdirp(paths.upper_dir) || !mkdirp(paths.work_dir)) {
        g_last_setup_error = "failed to create upper/work dirs on tmpfs";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    std::fprintf(stderr, "[sandbox_setup_fs] upper/work dirs created\n");

    // Mount overlayfs: lowerdir = function_code : rootfs
    auto overlay_opts = "lowerdir=" + lower_dir + ":" + rootfs +
                        ",upperdir=" + paths.upper_dir +
                        ",workdir=" + paths.work_dir;
    std::fprintf(stderr, "[sandbox_setup_fs] mounting overlay at %s with options %s\n", paths.merged_dir.c_str(), overlay_opts.c_str());
    auto overlay_start = std::chrono::high_resolution_clock::now();
    if (::mount("overlay", paths.merged_dir.c_str(), "overlay",
                MS_NOSUID, overlay_opts.c_str()) < 0) {
        g_last_setup_error = "mount overlay failed at " + paths.merged_dir + " (" + std::string(std::strerror(errno)) + "), opts=" + overlay_opts;
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    auto overlay_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - overlay_start).count();
    std::fprintf(stderr, "[sandbox_setup_fs] overlay mount took %ldms\n", overlay_ms);

    // Bind mount /run/events.sock into the sandbox for event communication back to the supervisor
    auto events_socket_host = "/run/events.sock";
    auto events_socket_jail = paths.merged_dir + "/run/events.sock";
    std::fprintf(stderr, "[sandbox_setup_fs] creating /run directory in merged dir\n");
    if (!mkdirp(paths.merged_dir + "/run")) {
        g_last_setup_error = "failed to create /run in merged dir for socket bind mount";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    std::fprintf(stderr, "[sandbox_setup_fs] creating socket bind mount target file\n");
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
    std::fprintf(stderr, "[sandbox_setup_fs] binding mount %s to %s\n", events_socket_host, events_socket_jail.c_str());
    auto bind_start = std::chrono::high_resolution_clock::now();
    if (::mount(events_socket_host, events_socket_jail.c_str(), nullptr, MS_BIND | MS_SHARED, nullptr) < 0) {
        g_last_setup_error = "bind mount of events.sock failed at " + events_socket_jail + " (" + std::string(std::strerror(errno)) + ")";
        std::fprintf(stderr, "[sandbox] %s\n", g_last_setup_error.c_str());
        return false;
    }
    auto bind_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - bind_start).count();
    std::fprintf(stderr, "[sandbox_setup_fs] socket bind mount took %ldms\n", bind_ms);

    auto total_fs_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - fs_start).count();
    std::fprintf(stderr, "[sandbox_setup_fs] TOTAL: %ldms (tmpfs=%ldms, overlay=%ldms, bind=%ldms)\n",
                 total_fs_ms, tmpfs_ms, overlay_ms, bind_ms);

    return true;
}

int sandbox_spawn_worker(const SandboxPaths& paths,
                         const std::string& invocation_id,
                         const std::string& entry,
                         const std::string& bun_path,
                         uint64_t memory_bytes,
                         int uid, int gid) {
    auto spawn_start = std::chrono::high_resolution_clock::now();

    // 1. Create cgroup for this invocation
    auto cgroup_start = std::chrono::high_resolution_clock::now();
    if (!cgroup_create(invocation_id, memory_bytes)) {
        std::fprintf(stderr, "[sandbox] Failed to create cgroup for %s\n", invocation_id.c_str());
        // Continue without cgroup — non-fatal
    }
    auto cgroup_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - cgroup_start).count();
    std::fprintf(stderr, "[spawn_worker] cgroup_create took %ldms\n", cgroup_ms);

    // 2. Prepare child args

    ChildArgs args{};
    args.merged_dir    = paths.merged_dir.c_str();
    args.invocation_id = invocation_id.c_str();
    args.uid           = uid;
    args.gid           = gid;
    args.bun_path      = bun_path.c_str();
    args.worker_script = "/opt/shim/dist/worker-main.js";
    args.entry         = entry.c_str();

    // 3. Allocate stack for clone
    auto* stack = static_cast<char*>(std::malloc(CHILD_STACK_SIZE));
    if (!stack) {
        std::perror("[sandbox] malloc stack");
        cgroup_destroy(invocation_id);
        return -1;
    }
    // Stack grows downward
    char* stack_top = stack + CHILD_STACK_SIZE;

    // 4. Clone with new PID, mount, and UTS namespaces
    std::fprintf(stderr, "[spawn_worker] calling clone...\n");
    auto clone_start = std::chrono::high_resolution_clock::now();
    // Clone with new PID, mount, and UTS namespaces.
    // CLONE_NEWNS gives the child its own mount namespace so that the /proc and
    // /dev mounts inside child_fn don't leak back into the supervisor's view.
    int clone_flags = CLONE_VM | CLONE_VFORK | CLONE_NEWPID | CLONE_NEWNS | SIGCHLD;
    pid_t child_pid = clone(child_fn, stack_top, clone_flags, &args);
    auto clone_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - clone_start).count();
    std::fprintf(stderr, "[spawn_worker] clone + child_fn returned in %ldms (pid=%d)\n", clone_ms, child_pid);

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
    std::fprintf(stderr, "[spawn_worker] cgroup_add_pid took %ldms\n", cgroup_add_ms);

    std::fprintf(stderr, "[spawn_worker] waiting for child (pid %d) to exit...\n", child_pid);
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
    std::fprintf(stderr, "[spawn_worker] waitpid took %ldms (status=%d)\n", wait_ms, status);

    std::free(stack);

    auto total_spawn_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - spawn_start).count();
    std::fprintf(stderr, "[spawn_worker] TOTAL: %ldms (cgroup=%ldms, clone+child=%ldms, cgroup_add=%ldms, wait=%ldms)\n",
                 total_spawn_ms, cgroup_ms, clone_ms, cgroup_add_ms, wait_ms);

    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    } else if (WIFSIGNALED(status)) {
        std::fprintf(stderr, "[sandbox] Worker killed by signal %d\n", WTERMSIG(status));
        return 128 + WTERMSIG(status);
    }
    return -1;
}

void sandbox_cleanup(const SandboxPaths& paths, const std::string& invocation_id) {
    std::fprintf(stderr, "[sandbox_cleanup] starting cleanup for %s\n", invocation_id.c_str());

    // Lazy-unmount the socket bind mount first (it sits inside merged_dir)
    auto events_socket_jail = paths.merged_dir + "/run/events.sock";
    std::fprintf(stderr, "[sandbox_cleanup] unmounting socket at %s\n", events_socket_jail.c_str());
    if (::umount2(events_socket_jail.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 events.sock(%s): %s\n",
                     events_socket_jail.c_str(), std::strerror(errno));
    }
    std::fprintf(stderr, "[sandbox_cleanup] socket unmounted\n");

    // Lazy-unmount overlay
    std::fprintf(stderr, "[sandbox_cleanup] unmounting overlay at %s\n", paths.merged_dir.c_str());
    if (::umount2(paths.merged_dir.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 overlay(%s): %s\n",
                     paths.merged_dir.c_str(), std::strerror(errno));
    }
    std::fprintf(stderr, "[sandbox_cleanup] overlay unmounted\n");

    // Lazy-unmount tmpfs
    std::fprintf(stderr, "[sandbox_cleanup] unmounting tmpfs at %s\n", paths.rw_dir.c_str());
    if (::umount2(paths.rw_dir.c_str(), MNT_DETACH) < 0 && errno != EINVAL && errno != ENOENT) {
        std::fprintf(stderr, "[sandbox_cleanup] umount2 tmpfs(%s): %s\n",
                     paths.rw_dir.c_str(), std::strerror(errno));
    }
    std::fprintf(stderr, "[sandbox_cleanup] tmpfs unmounted\n");

    // Remove directory tree
    std::fprintf(stderr, "[sandbox_cleanup] removing directory tree %s\n", paths.inv_dir.c_str());
    rmtree(paths.inv_dir);
    std::fprintf(stderr, "[sandbox_cleanup] directory tree removed\n");

    // Destroy cgroup
    std::fprintf(stderr, "[sandbox_cleanup] destroying cgroup for %s\n", invocation_id.c_str());
    cgroup_destroy(invocation_id);
    std::fprintf(stderr, "[sandbox_cleanup] cgroup destroyed\n");
}

} // namespace invoke
