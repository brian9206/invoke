// ============================================================================
// Protocol — Newline-delimited JSON framing (matches invoke-runtime protocol.ts)
// ============================================================================
#pragma once

#include <cstddef>
#include <string>
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

} // namespace invoke
