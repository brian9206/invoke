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
#include <fcntl.h>
#include <iostream>
#include <memory>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

namespace invoke {

static const char *WORKER_PATH = "/opt/invoke/worker";

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

    // Copy source files into output/source/ so the build sandbox can access them at /output/source
    std::string source_input_dir = output_dir + "/source";
    if (::mkdir(source_input_dir.c_str(), 0755) < 0 && errno != EEXIST) {
        std::fprintf(stderr, "[supervisor] Failed to create output/source dir: %s\n", std::strerror(errno));
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to create output/source dir"}});
        std::string rm_cmd = "rm -rf " + build_rw;
        ::system(rm_cmd.c_str());
        ipc.send("ready");
        return;
    }
    {
        std::string cp_cmd = "cp -rp " + source_dir + "/." + " " + source_input_dir + "/";
        int cp_ret = ::system(cp_cmd.c_str());
        if (cp_ret != 0) {
            std::fprintf(stderr, "[supervisor] Failed to copy source files to output/source (exit %d)\n", cp_ret);
            ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to copy source files"}});
            std::string rm_cmd = "rm -rf " + build_rw;
            ::system(rm_cmd.c_str());
            ipc.send("ready");
            return;
        }
        // Make the source directory writable by the worker so pipeline can modify it (e.g., nuget.config)
        if (::chmod(source_input_dir.c_str(), 0777) < 0) {
            std::fprintf(stderr, "[supervisor] Warning: Failed to chmod output/source directory: %s\n", std::strerror(errno));
            // Non-fatal; continue anyway
        }
    }

    const std::string sandbox_dir = std::string("/opt/inv/bld-") + build_id;
    if (::mkdir(sandbox_dir.c_str(), 0755) < 0 && errno != EEXIST) {
        std::fprintf(stderr, "[supervisor] Failed to create build sandbox dir: %s\n", std::strerror(errno));
        ipc.send("build_complete", {{"success", false}, {"buildId", build_id}, {"error", "Failed to create inv dir"}});
        ipc.send("ready");
        return;
    }

    // Set up build filesystem: /output rw bind to output_dir (source pre-copied to output_dir/source/), /tmp tmpfs
    ILOG("[supervisor:build] Setting up build filesystem for %s\n", build_id.c_str());
    if (!sandbox_setup_build_fs(sandbox_dir, output_dir, config.rootfs_path)) {
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

    // Spawn worker with build payload
    // memoryMb minimum is 256 MB (enforced by API)
    ILOG("[supervisor:build] Spawning build worker for %s\n", build_id.c_str());
    int build_memory_mb = p.value("memoryMb", 256);
    uint64_t build_memory_bytes = (build_memory_mb > 0)
        ? static_cast<uint64_t>(build_memory_mb) * 1024 * 1024
        : 0;
    pid_t worker_pid = sandbox_start_worker(
        sandbox_dir,
        "bld-" + build_id,
        {WORKER_PATH, "builder"},
        build_memory_bytes,
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
    std::string runtime       = p.value("runtime", "");
    // Determine memory limit from payload (fall back to default)
    int memory_mb = p.value("memoryMb", config.default_memory_mb);
    uint64_t memory_bytes = static_cast<uint64_t>(memory_mb) * 1024 * 1024;

    if (invocation_id.empty()) {
        std::fprintf(stderr, "[supervisor] Invalid execute event: missing fields\n");
        ipc.send("worker_error", {{"error", "Missing invocationId"}});
        ipc.send("ready");
        return;
    }

    const std::string lower_dir = std::string("/functions/") + function_id;
    const std::string sandbox_dir = std::string("/opt/inv/") + invocation_id;

    // Determine argv
    std::vector<const char *> argv;

    if (runtime == "bun") {
      argv = {WORKER_PATH, "index.js"};
    }
    else {
      argv = {"/app/program"};
    }

    ILOG("[supervisor] execve target: %s (runtime=%s)\n", argv[0], runtime.c_str());
    
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
        argv,
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

// ---------------------------------------------------------------------------
// Debug shell
// ---------------------------------------------------------------------------

void supervisor_run_debug(const SupervisorConfig& config) {
    // Use INVOKE_DEBUG_APP_DIR if set, otherwise default to /invoke-app.
    // Mount your project directory here (outside /opt/rootfs) to avoid the
    // nested overlayfs limitation where bind mounts inside the lowerdir are
    // not visible through the overlay.
    const char* debug_app_env = std::getenv("INVOKE_DEBUG_APP_DIR");
    const std::string debug_app_dir = (debug_app_env && debug_app_env[0]) ? debug_app_env : "/invoke-app";
    ::mkdir(debug_app_dir.c_str(), 0755); // create if not already present (e.g. no volume mounted)

    std::cout << "[supervisor] *** DEBUG MODE ***" << std::endl;
    std::cout << "[supervisor] Setting up sandbox environment..." << std::endl;
    std::cout << "[supervisor]   app dir: " << debug_app_dir << std::endl;
    std::cout << "[supervisor]   (mount your project with: -v /host/path:" << debug_app_dir << ")" << std::endl;

    // Ensure required directories exist
    ::mkdir("/opt/inv", 0755);
    ::mkdir("/run", 0755);

    // Create a dummy events.sock so sandbox_setup_fs bind-mount doesn't fail
    // (in debug mode there is no event socket running)
    {
        int fd = ::open("/run/events.sock", O_CREAT | O_WRONLY, 0600);
        if (fd >= 0) ::close(fd);
    }

    const std::string sandbox_dir = "/opt/inv/debug";
    if (::mkdir(sandbox_dir.c_str(), 0755) < 0 && errno != EEXIST) {
        std::perror("[supervisor] Failed to create debug sandbox dir");
        return;
    }

    // Initialise cgroup subsystem (needed by sandbox_start_worker)
    cgroup_init();

    // Set up overlay + tmpfs filesystem
    if (!sandbox_setup_fs(sandbox_dir, debug_app_dir, config.rootfs_path, config.tmpfs_mb)) {
        std::fprintf(stderr, "[supervisor] Debug sandbox filesystem setup failed: %s\n",
                     sandbox_last_setup_error().c_str());
        return;
    }

    std::cout << "[supervisor] Sandbox ready — launching interactive shell inside rootfs" << std::endl;
    std::cout << "[supervisor] (Type 'exit' or press Ctrl+D to leave the sandbox)" << std::endl;

    uint64_t memory_bytes = static_cast<uint64_t>(config.default_memory_mb) * 1024 * 1024;

    // Spawn /bin/sh as root (uid=0, gid=0) inside the sandboxed rootfs
    pid_t child_pid = sandbox_start_worker(
        sandbox_dir,
        "debug",
        {"/bin/sh"},
        memory_bytes,
        0, 0,           // run as root inside sandbox
        {}            // no extra env
    );

    if (child_pid < 0) {
        std::fprintf(stderr, "[supervisor] Failed to start debug shell\n");
        sandbox_cleanup(sandbox_dir, "debug");
        return;
    }

    // Wait for the interactive shell to exit
    int status = 0;
    while (::waitpid(child_pid, &status, 0) < 0) {
        if (errno != EINTR) {
            std::perror("[supervisor] waitpid");
            break;
        }
    }

    int exit_code = -1;
    if (WIFEXITED(status))        exit_code = WEXITSTATUS(status);
    else if (WIFSIGNALED(status)) exit_code = 128 + WTERMSIG(status);

    std::cout << "[supervisor] Debug shell exited (code " << exit_code << ")" << std::endl;

    sandbox_cleanup(sandbox_dir, "debug");
}

} // namespace invoke
