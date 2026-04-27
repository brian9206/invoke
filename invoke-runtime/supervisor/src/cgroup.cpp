#include <cstdint>
#include <string>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <poll.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#define CGROUP_BASE "/sys/fs/cgroup/invoke_root"

namespace invoke {

// NEW: Force the supervisor to stay in the root cgroup.
// Without this, PID 1 can get "pulled" into a child group and 
// block all future 'subtree_control' writes.
// Only moves self if not already in the root cgroup (avoids a cgroupfs write on every invocation).
static void cgroup_ensure_supervisor_at_root() {
    // Read current cgroup of self
    int rfd = ::open("/proc/self/cgroup", O_RDONLY);
    if (rfd >= 0) {
        char buf[256] = {};
        ::read(rfd, buf, sizeof(buf) - 1);
        ::close(rfd);
        // If the cgroup line ends with just "0::/" we are already at root — skip the write.
        if (std::strstr(buf, "0::/\n") || std::strstr(buf, "0::/ ")) return;
    }
    int fd = ::open("/sys/fs/cgroup/cgroup.procs", O_WRONLY);
    if (fd >= 0) {
        const char* self_pid = "0"; // Moves 'self'
        ::write(fd, self_pid, 1);
        ::close(fd);
    }
}

static bool write_file(const std::string& path, const std::string& content) {
    int fd = ::open(path.c_str(), O_WRONLY | O_TRUNC);
    if (fd < 0) return false;
    ssize_t n = ::write(fd, content.data(), content.size());
    ::close(fd);
    return n == (ssize_t)content.size();
}

bool cgroup_init() {
    cgroup_ensure_supervisor_at_root();
    
    if (::mkdir(CGROUP_BASE, 0755) < 0 && errno != EEXIST) return false;

    // Enable memory controller for the subtree
    // This ONLY works if no processes are in CGROUP_BASE itself
    std::string ctrl = std::string(CGROUP_BASE) + "/cgroup.subtree_control";
    return write_file(ctrl, "+memory");
}

bool cgroup_create(const std::string& invocation_id, uint64_t memory_bytes) {
    cgroup_ensure_supervisor_at_root(); 
    
    std::string dir = std::string(CGROUP_BASE) + "/" + invocation_id;
    if (::mkdir(dir.c_str(), 0755) < 0 && errno != EEXIST) return false;

    write_file(dir + "/memory.max", std::to_string(memory_bytes));
    return true;
}

bool cgroup_destroy(const std::string& invocation_id) {
    std::string dir = std::string(CGROUP_BASE) + "/" + invocation_id;
    std::string events_path = dir + "/cgroup.events";

    // 1. Reap all possible zombies first
    int status;
    while (::waitpid(-1, &status, WNOHANG) > 0);

    // 2. Open events file to monitor 'populated' status
    int fd = ::open(events_path.c_str(), O_RDONLY);
    if (fd < 0) return (::rmdir(dir.c_str()) == 0);

    struct pollfd pfd{};
    pfd.fd = fd;
    pfd.events = POLLPRI;

    // 3. Retry loop for rmdir
    for (int attempt = 0; attempt < 5; ++attempt) {
        if (::rmdir(dir.c_str()) == 0) {
            ::close(fd);
            return true;
        }

        if (errno == EBUSY) {
            // Check if it's empty according to the kernel
            char buf[256];
            ::lseek(fd, 0, SEEK_SET);
            ssize_t n = ::read(fd, buf, sizeof(buf)-1);
            if (n > 0) {
                buf[n] = '\0';
                if (std::strstr(buf, "populated 0")) {
                    // Kernel says it's empty, but rmdir says EBUSY
                    // This is a race condition; wait 10ms and try again
                    usleep(10000); 
                    continue;
                }
            }
            // Block until something changes
            ::poll(&pfd, 1, 100);
            while (::waitpid(-1, &status, WNOHANG) > 0);
        } else {
            break;
        }
    }

    ::close(fd);
    return (::rmdir(dir.c_str()) == 0);
}

bool cgroup_add_pid(const std::string& invocation_id, pid_t pid) {
    // Safety check: Don't move the supervisor (PID 1)
    if (pid <= 1) return false;

    auto path = std::string(CGROUP_BASE) + "/" + invocation_id + "/cgroup.procs";
    int fd = ::open(path.c_str(), O_WRONLY);
    if (fd < 0) return false;

    std::string s = std::to_string(pid);
    ssize_t n = ::write(fd, s.data(), s.size());
    ::close(fd);
    
    return n == static_cast<ssize_t>(s.size());
}

} // namespace invoke
