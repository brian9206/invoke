// ============================================================================
// Supervisor — Main event loop and orchestration implementation
// ============================================================================

#include "supervisor.h"
#include "cgroup.h"
#include "protocol.h"
#include "sandbox.h"

#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

namespace invoke {

// ---------------------------------------------------------------------------
// Signal handling
// ---------------------------------------------------------------------------

static volatile sig_atomic_t g_shutdown = 0;

static void signal_handler(int /*sig*/) {
    g_shutdown = 1;
}

// ---------------------------------------------------------------------------
// Build handler
// ---------------------------------------------------------------------------

static void handle_build(IpcChannel& ipc, const SupervisorConfig& config, const ParsedEvent& ev) {
    const auto& p = ev.payload;

    std::string build_id   = p.value("buildId", "");

    if (build_id.empty()) {
        std::fprintf(stderr, "[supervisor] Invalid build event: missing buildId\n");
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Missing buildId"}});
        ipc.send("ready");
        return;
    }

    // build_rw: persistent output dir on host where artifact.tgz will be written
    std::string build_rw = std::string("/builds/") + build_id;
    if (::mkdir(build_rw.c_str(), 0755) < 0 && errno != EEXIST) {
        std::fprintf(stderr, "[supervisor] Failed to create build output dir: %s\n", std::strerror(errno));
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to create build dir"}});
        ipc.send("ready");
        return;
    }

    // source_dir: where the execution service has placed source files for this build
    std::string source_dir = build_rw + "/source";
    if (::mkdir(source_dir.c_str(), 0755) < 0 && errno != EEXIST) {
        std::fprintf(stderr, "[supervisor] Failed to create build source dir: %s\n", std::strerror(errno));
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to create build source dir"}});
        ipc.send("ready");
        return;
    }

    // output_dir: bind-mounted into /output inside the sandbox (rw); build artifacts go here
    std::string output_dir = build_rw + "/output";
    if (::mkdir(output_dir.c_str(), 0755) < 0 && errno != EEXIST) {
        std::fprintf(stderr, "[supervisor] Failed to create build output subdir: %s\n", std::strerror(errno));
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to create output dir"}});
        ipc.send("ready");
        return;
    }

    const std::string sandbox_dir = std::string("/opt/inv/bld-") + build_id;
    if (::mkdir(sandbox_dir.c_str(), 0755) < 0 && errno != EEXIST) {
        std::fprintf(stderr, "[supervisor] Failed to create build sandbox dir: %s\n", std::strerror(errno));
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to create inv dir"}});
        ipc.send("ready");
        return;
    }

    // Set up build filesystem: rootfs ro bind, /app ro bind to source, /output rw bind, /tmp tmpfs
    ILOG("[supervisor:build] Setting up build filesystem for %s\n", build_id.c_str());
    if (!sandbox_setup_build_fs(sandbox_dir, source_dir, output_dir, config.rootfs_path)) {
        const auto& detail = sandbox_last_setup_error();
        std::fprintf(stderr, "[supervisor] Build filesystem setup failed for %s: %s\n",
                     build_id.c_str(), detail.c_str());
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Filesystem setup failed: " + detail}});
        sandbox_cleanup_build(sandbox_dir, "bld-" + build_id);
        ipc.send("ready");
        return;
    }

    // Build env (pass through any user-supplied env vars for the build)
    std::vector<std::string> build_env;
    if (p.contains("env") && p["env"].is_object()) {
        for (auto& [k, v] : p["env"].items()) {
            if (v.is_string() && k.find('=') == std::string::npos) {
                build_env.push_back(k + "=" + v.get<std::string>());
            }
        }
    }

    // Spawn worker with build payload (no cgroup / memory limit for builds)
    ILOG("[supervisor:build] Spawning build worker for %s\n", build_id.c_str());
    pid_t worker_pid = sandbox_start_worker(
        sandbox_dir,
        "bld-" + build_id,
        "index.js",     // entry (unused by build worker but required by signature)
        0,              // memory_bytes = 0 → cgroup created but with no limit
        config.worker_uid,
        config.worker_gid,
        build_env
    );

    if (worker_pid < 0) {
        std::fprintf(stderr, "[supervisor] Build worker spawn failed for %s\n", build_id.c_str());
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Worker spawn failed"}});
        sandbox_cleanup_build(sandbox_dir, "bld-" + build_id);
        ipc.send("ready");
        return;
    }

    // Wait for worker to finish
    int worker_status = 0;
    while (true) {
        pid_t ret = ::waitpid(worker_pid, &worker_status, 0);
        if (ret == worker_pid) break;
        if (ret < 0 && errno != EINTR) {
            std::perror("[supervisor] build waitpid");
            break;
        }
    }

    int exit_code = -1;
    if (WIFEXITED(worker_status))        exit_code = WEXITSTATUS(worker_status);
    else if (WIFSIGNALED(worker_status)) exit_code = 128 + WTERMSIG(worker_status);

    ILOG("[supervisor:build] Build worker exited with code %d for %s\n", exit_code, build_id.c_str());

    if (exit_code != 0) {
        std::fprintf(stderr, "[supervisor] Build failed (exit %d) for %s\n", exit_code, build_id.c_str());
        sandbox_cleanup_build(sandbox_dir, "bld-" + build_id);
        std::string rm_cmd = "rm -rf " + build_rw;
        ::system(rm_cmd.c_str());
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id},
                    {"error", "Build worker exited with code " + std::to_string(exit_code)}});
        ipc.send("ready");
        return;
    }

    // Clean up the build sandbox
    sandbox_cleanup_build(sandbox_dir, "bld-" + build_id);

    ILOG("[supervisor:build] Build complete for %s\n", build_id.c_str());
    // Clean up the build sandbox in /opt/inv
    std::string rm_cmd = "rm -rf " + build_rw;
    ::system(rm_cmd.c_str());
    ipc.send("build_complete", {
        {"success", true},
        {"buildId", build_id}
    });
    ipc.send("ready");
}

// ---------------------------------------------------------------------------
// Execute handler
// ---------------------------------------------------------------------------

static void handle_execute(IpcChannel& ipc, const SupervisorConfig& config, const ParsedEvent& ev) {
    // Extract fields from the execute event payload
    const auto& p = ev.payload;

    std::string function_id   = p.value("functionId", "");
    std::string invocation_id = p.value("invocationId", "");
    std::string code_path     = p.value("codePath", "");
    // Determine memory limit from payload (fall back to default)
    int memory_mb = p.value("memoryMb", config.default_memory_mb);
    uint64_t memory_bytes = static_cast<uint64_t>(memory_mb) * 1024 * 1024;

    if (invocation_id.empty() || code_path.empty()) {
        std::fprintf(stderr, "[supervisor] Invalid execute event: missing fields\n");
        ipc.send("worker_error", {{"error", "Missing invocationId or codePath"}});
        ipc.send("ready");
        return;
    }

    // Determine paths
    // code_path is like /functions/<funcId>/index.js
    // lower_dir = directory containing the code: /functions/<funcId>
    // entry     = basename: index.js
    auto slash = code_path.rfind('/');
    std::string lower_dir = (slash != std::string::npos) ? code_path.substr(0, slash) : "/functions";
    std::string entry = (slash != std::string::npos) ? code_path.substr(slash + 1) : code_path;

    const std::string sandbox_dir = std::string("/opt/inv/") + invocation_id;

    auto inv_start = std::chrono::high_resolution_clock::now();

    // 1. Set up filesystem
    ILOG("[supervisor] Setting up filesystem for %s\n", invocation_id.c_str());
    auto fs_start = std::chrono::high_resolution_clock::now();
    if (!sandbox_setup_fs(sandbox_dir, lower_dir, config.rootfs_path, config.tmpfs_mb)) {
        const auto& detail = sandbox_last_setup_error();
        std::fprintf(stderr, "[supervisor] Filesystem setup failed for %s: %s\n",
                     invocation_id.c_str(), detail.c_str());
        ipc.send("worker_error", {{"error", "Filesystem setup failed"}, {"detail", detail}});
        sandbox_cleanup(sandbox_dir, invocation_id);
        ipc.send("ready");
        return;
    }
    auto fs_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - fs_start).count();
    ILOG("[supervisor] Filesystem setup took %ldms\n", fs_ms);

    // Build env vector from execute payload
    std::vector<std::string> user_env;
    if (p.contains("env") && p["env"].is_object()) {
        for (auto& [k, v] : p["env"].items()) {
            if (v.is_string() && k.find('=') == std::string::npos) {
                user_env.push_back(k + "=" + v.get<std::string>());
            }
        }
    }

    // 2. Spawn worker
    ILOG("[supervisor] Spawning worker for %s\n", invocation_id.c_str());
    auto spawn_start = std::chrono::high_resolution_clock::now();
    pid_t worker_pid = sandbox_start_worker(
        sandbox_dir,
        invocation_id,
        entry,
        memory_bytes,
        config.worker_uid,
        config.worker_gid,
        user_env
    );

    if (worker_pid < 0) {
        std::fprintf(stderr, "[supervisor] Worker spawn failed for %s\n", invocation_id.c_str());
        ipc.send("worker_error", {{"error", "Worker spawn failed"}});
        sandbox_cleanup(sandbox_dir, invocation_id);
        ipc.send("ready");
        return;
    }

    // Wait for worker to finish while listening for kill events via IpcChannel
    bool kill_sent = false;
    int worker_status = 0;

    ipc.once("kill", [&](const json& p) {
        if (!kill_sent) {
            kill_sent = true;
            const std::string reason = p.value("reason", "unknown");
            ILOG("[supervisor] kill event received (reason=%s) — sending SIGKILL to pid %d\n",
                 reason.c_str(), worker_pid);
            ::kill(worker_pid, SIGKILL);
        }
    });

    while (true) {
        pid_t ret = ::waitpid(worker_pid, &worker_status, WNOHANG);
        if (ret == worker_pid) break;
        if (ret < 0 && errno != EINTR) {
            std::perror("[supervisor] waitpid");
            break;
        }

        if (!ipc.process_once(50)) {
            // Host closed connection — kill worker
            if (!kill_sent) {
                kill_sent = true;
                ::kill(worker_pid, SIGKILL);
            }
        }
    }

    ipc.off("kill");

    auto spawn_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - spawn_start).count();
    ILOG("[supervisor] Worker finished in %ldms\n", spawn_ms);

    int exit_code = -1;
    if (WIFEXITED(worker_status))        exit_code = WEXITSTATUS(worker_status);
    else if (WIFSIGNALED(worker_status)) exit_code = 128 + WTERMSIG(worker_status);

    if (exit_code != 0 && !kill_sent) {
        std::fprintf(stderr, "[supervisor] Worker exited with code %d for %s\n",
                     exit_code, invocation_id.c_str());
        ipc.send("worker_error", {{"error", "Worker exited with code " + std::to_string(exit_code)}});
    }

    // 3. Cleanup
    ILOG("[supervisor] Cleaning up sandbox for %s\n", invocation_id.c_str());
    auto cleanup_start = std::chrono::high_resolution_clock::now();
    sandbox_cleanup(sandbox_dir, invocation_id);
    auto cleanup_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - cleanup_start).count();
    ILOG("[supervisor] Cleanup took %ldms\n", cleanup_ms);
    ILOG("[supervisor] Sandbox cleanup complete for %s\n", invocation_id.c_str());

    auto total_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - inv_start).count();
    ILOG("[supervisor] TOTAL invocation: %ldms (fs=%ldms, spawn=%ldms, cleanup=%ldms)\n",
         total_ms, fs_ms, spawn_ms, cleanup_ms);

    // 4. Signal ready for next invocation
    std::cout << "[supervisor] ready for next invocation" << std::endl;
    ipc.send("ready", {{"exitCode", exit_code}});
    ILOG("[supervisor] Ready event sent, waiting for next invocation\n");
}

// ---------------------------------------------------------------------------
// Main event loop
// ---------------------------------------------------------------------------

void supervisor_run(const SupervisorConfig& config) {
    // Install signal handlers
    struct sigaction sa{};
    sa.sa_handler = signal_handler;
    sigemptyset(&sa.sa_mask);
    ::sigaction(SIGTERM, &sa, nullptr);
    ::sigaction(SIGINT, &sa, nullptr);

    // Ensure invocation base dir exists
    ::mkdir("/opt/inv", 0755);

    // Initialize cgroup subsystem
    cgroup_init();

    // Connect to host IPC socket
    std::unique_ptr<IpcChannel> ipc_owner;
    try {
        ipc_owner = std::make_unique<IpcChannel>(config.socket_path);
    } catch (const std::exception& e) {
        std::fprintf(stderr, "[supervisor] Failed to connect to host: %s\n", e.what());
        return;
    }
    IpcChannel& ipc = *ipc_owner;
    ILOG("[supervisor] Connected to host IPC\n");

    // Register event handlers
    ipc.on("execute", [&](const json& p) {
        ParsedEvent ev{ "execute", p };
        std::cout << "[supervisor] execute request received" << std::endl;
        handle_execute(ipc, config, ev);
    });
    ipc.on("build", [&](const json& p) {
        ParsedEvent ev{ "build", p };
        std::cout << "[supervisor] build request received" << std::endl;
        handle_build(ipc, config, ev);
    });

    // Send initial ready
    ipc.send("ready");
    ILOG("[supervisor] Initial ready sent, entering event loop\n");

    // Event loop
    while (!g_shutdown) {
        ILOG("[supervisor] Waiting for event from host...\n");
        if (!ipc.process_once()) {
            std::fprintf(stderr, "[supervisor] Host socket closed (EOF) or read error, exiting\n");
            break;
        }
    }

    ILOG("[supervisor] Shutdown complete\n");
}

} // namespace invoke
