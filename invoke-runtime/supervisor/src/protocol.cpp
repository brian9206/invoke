// ============================================================================
// Protocol — Newline-delimited JSON framing implementation
// ============================================================================

#include "protocol.h"

#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
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

std::string encode_binary_header(const std::string& event, const json& payload, size_t size) {
    json frame;
    frame["event"]   = event;
    frame["payload"] = payload;
    frame["binary"]  = true;
    frame["size"]    = size;
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

// ============================================================================
// IpcChannel implementation
// ============================================================================

IpcChannel::IpcChannel(const std::string& socket_path) {
    fd_ = ::socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    if (fd_ < 0) {
        throw std::runtime_error(std::string("[IpcChannel] socket(): ") + std::strerror(errno));
    }

    struct sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, socket_path.c_str(), sizeof(addr.sun_path) - 1);

    if (::connect(fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd_);
        throw std::runtime_error(std::string("[IpcChannel] connect(): ") + std::strerror(errno));
    }
}

IpcChannel::~IpcChannel() {
    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }
}

void IpcChannel::on(const std::string& event, EventHandler handler) {
    handlers_[event].push_back(std::move(handler));
}

void IpcChannel::once(const std::string& event, EventHandler handler) {
    once_handlers_[event].push_back(std::move(handler));
}

void IpcChannel::off(const std::string& event) {
    handlers_.erase(event);
    once_handlers_.erase(event);
}

void IpcChannel::send(const std::string& event, const json& payload) {
    write_event(fd_, event, payload);
}

void IpcChannel::send(const std::string& event) {
    write_event(fd_, event);
}

void IpcChannel::send(const std::string& event, const json& payload,
                            const void* data, size_t len) {
    std::string header = encode_binary_header(event, payload, len);
    write_all(fd_, header.data(), header.size());
    write_all(fd_, data, len);
}

bool IpcChannel::process_once(int timeout_ms) {
    if (timeout_ms >= 0) {
        struct pollfd pfd{ fd_, POLLIN, 0 };
        int ret = ::poll(&pfd, 1, timeout_ms);
        if (ret < 0) {
            if (errno == EINTR) return true;
            return false;
        }
        if (ret == 0) return true; // timeout — no data, not an error
        if (!(pfd.revents & POLLIN)) return true;
    }

    char buf[8192];
    ssize_t n = ::read(fd_, buf, sizeof(buf));
    if (n < 0) {
        if (errno == EINTR) return true;
        return false;
    }
    if (n == 0) return false; // EOF

    auto events = decoder_.feed(buf, static_cast<size_t>(n));
    for (const auto& ev : events) {
        dispatch(ev);
    }
    return true;
}

void IpcChannel::dispatch(const ParsedEvent& ev) {
    // Fire persistent handlers
    auto it = handlers_.find(ev.event);
    if (it != handlers_.end()) {
        for (const auto& handler : it->second) {
            handler(ev.payload);
        }
    }

    // Fire and drain once-handlers
    auto oit = once_handlers_.find(ev.event);
    if (oit != once_handlers_.end()) {
        // Move out the handlers before calling them so off() inside a handler
        // doesn't cause an iterator invalidation issue.
        auto fired = std::move(oit->second);
        once_handlers_.erase(oit);
        for (const auto& handler : fired) {
            handler(ev.payload);
        }
    }
}

} // namespace invoke
