// ============================================================================
// Protocol — Newline-delimited JSON framing implementation
// ============================================================================

#include "protocol.h"

#include <cerrno>
#include <unistd.h>

namespace invoke {

std::string encode(const std::string& event, const json& payload) {
    json frame;
    frame["event"] = event;
    frame["payload"] = payload;
    return frame.dump() + "\n";
}

std::string encode(const std::string& event) {
    json frame;
    frame["event"] = event;
    return frame.dump() + "\n";
}

std::vector<ParsedEvent> EventDecoder::feed(const char* data, size_t len) {
    std::vector<ParsedEvent> events;
    buffer_.append(data, len);

    size_t pos = 0;
    while (pos < buffer_.size()) {
      size_t nl = buffer_.find('\n', pos);
      if (nl == std::string::npos) {
        break;
      }

      std::string line = buffer_.substr(pos, nl - pos);
      pos = nl + 1;

      if (line.empty()) {
        continue;
      }

      try {
        json parsed = json::parse(line);
        ParsedEvent ev;
        ev.event = parsed.value("event", std::string());
        if (parsed.contains("payload")) {
          ev.payload = parsed["payload"];
        } else {
          ev.payload = nullptr;
        }
        events.push_back(std::move(ev));
      } catch (...) {
        // Ignore malformed lines and continue decoding future frames.
      }
    }

    buffer_.erase(0, pos);
    return events;
}

bool write_all(int fd, const void* buf, size_t len) {
    const auto* ptr = static_cast<const char*>(buf);
    size_t written = 0;

    while (written < len) {
      ssize_t n = ::write(fd, ptr + written, len - written);
      if (n < 0) {
        if (errno == EINTR) {
          continue;
        }
        return false;
      }
      written += static_cast<size_t>(n);
    }

    return true;
}

bool write_event(int fd, const std::string& event, const json& payload) {
    std::string msg = encode(event, payload);
    return write_all(fd, msg.data(), msg.size());
}

bool write_event(int fd, const std::string& event) {
    std::string msg = encode(event);
    return write_all(fd, msg.data(), msg.size());
}

} // namespace invoke
