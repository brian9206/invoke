// ============================================================================
// Protocol — Newline-delimited JSON framing (matches invoke-runtime protocol.ts)
// ============================================================================
#pragma once

#include <cstddef>
#include <functional>
#include <string>
#include <unordered_map>
#include <vector>
#include <nlohmann/json.hpp>

namespace invoke {

using json = nlohmann::json;

// ---------------------------------------------------------------------------
// Parsed event
// ---------------------------------------------------------------------------

struct ParsedEvent {
    std::string event;
    json        payload;
};

// ---------------------------------------------------------------------------
// Encode helpers
// ---------------------------------------------------------------------------

/// Encode a text event with payload: {"event":"...","payload":{...}}\n
std::string encode(const std::string& event, const json& payload);

/// Encode a text event without payload: {"event":"..."}\n
std::string encode(const std::string& event);

/// Encode a binary frame header: {"event":"...","payload":{...},"binary":true,"size":<len>}\n
/// Write this header immediately followed by `size` raw bytes to form a complete binary frame.
std::string encode_binary_header(const std::string& event, const json& payload, size_t size);

// ---------------------------------------------------------------------------
// Streaming decoder
// ---------------------------------------------------------------------------

/// Streaming decoder: feed raw bytes, get back complete events.
/// Handles newline-delimited JSON (text mode only — binary mode not needed
/// on the supervisor side since we only receive text events from the host).
class EventDecoder {
public:
    /// Feed raw data and return any complete events.
    std::vector<ParsedEvent> feed(const char* data, size_t len);

private:
    std::string buffer_;
};

// ---------------------------------------------------------------------------
// Write helpers (best-effort full write)
// ---------------------------------------------------------------------------

/// Write all bytes to fd, retrying on EINTR. Returns true on success.
bool write_all(int fd, const void* buf, size_t len);

/// Convenience: write an encoded event string to fd.
bool write_event(int fd, const std::string& event, const json& payload);

/// Convenience: write an event without payload to fd.
bool write_event(int fd, const std::string& event);

// ---------------------------------------------------------------------------
// IpcChannel — EventEmitter-style wrapper around a Unix domain socket
//
// Mirrors the TypeScript IpcChannel in invoke-runtime/worker/src/protocol.ts.
//
// Usage:
//   IpcChannel ipc(socket_path);           // connects immediately
//   ipc.on("execute", [](const json& p) { ... });
//   ipc.once("kill",  [](const json& p) { ... });
//   ipc.send("ready");
//   while (!shutdown) { if (!ipc.process_once()) break; }
// ---------------------------------------------------------------------------

/// Handler type: called with the event payload when the event fires.
using EventHandler = std::function<void(const json&)>;

class IpcChannel {
public:
    /// Connect to the Unix domain socket at `socket_path`.
    /// Throws std::runtime_error on failure.
    explicit IpcChannel(const std::string& socket_path);

    /// Closes the underlying socket.
    ~IpcChannel();

    // Non-copyable, non-movable (owns a raw fd).
    IpcChannel(const IpcChannel&) = delete;
    IpcChannel& operator=(const IpcChannel&) = delete;

    // -------------------------------------------------------------------------
    // Listener registration
    // -------------------------------------------------------------------------

    /// Register a persistent listener for `event`.
    void on(const std::string& event, EventHandler handler);

    /// Register a one-shot listener for `event` — auto-removed after first fire.
    void once(const std::string& event, EventHandler handler);

    /// Remove ALL listeners (persistent and one-shot) for `event`.
    void off(const std::string& event);

    // -------------------------------------------------------------------------
    // Sending
    // -------------------------------------------------------------------------

    /// Send a text event with payload.
    void send(const std::string& event, const json& payload);

    /// Send a text event without payload.
    void send(const std::string& event);

    /// Send a binary-framed event: header line then `len` raw bytes.
    /// The receiver must support the binary framing protocol
    /// ({"binary":true,"size":<len>} header followed by raw bytes).
    void send(const std::string& event, const json& payload,
              const void* data, size_t len);

    // -------------------------------------------------------------------------
    // Event loop helpers
    // -------------------------------------------------------------------------

    /// Read and dispatch one chunk from the socket.
    ///
    /// `timeout_ms = -1` (default): blocking read.
    /// `timeout_ms >= 0`: poll() with that timeout first; returns true without
    ///                    reading if the socket has no data within the timeout.
    ///
    /// Returns true on success (including timeout with no data).
    /// Returns false on EOF or unrecoverable read error — caller should exit loop.
    bool process_once(int timeout_ms = -1);

    /// Raw file descriptor (e.g. for use with waitpid + external poll).
    int fd() const { return fd_; }

private:
    int          fd_;
    EventDecoder decoder_;
    std::unordered_map<std::string, std::vector<EventHandler>> handlers_;
    std::unordered_map<std::string, std::vector<EventHandler>> once_handlers_;

    void dispatch(const ParsedEvent& ev);
};

} // namespace invoke
