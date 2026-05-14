using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;

namespace Invoke.Internal;

/// <summary>
/// Singleton IPC channel that communicates with the host runtime over the
/// Unix domain socket at <c>/run/events.sock</c> using newline-delimited JSON
/// framing — identical to the protocol used by the JavaScript worker.
/// </summary>
internal sealed class IpcChannel : IDisposable
{
    private const string SocketPath = "/run/events.sock";

    private readonly Socket _socket;
    private readonly NetworkStream _stream;
    private readonly StreamReader _reader;
    private readonly SemaphoreSlim _writeLock = new(1, 1);

    // Pending one-shot event callbacks: event name → list of TaskCompletionSources
    private readonly Dictionary<string, List<TaskCompletionSource<JsonElement?>>> _pending =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();

    // Continuous handlers (for repeating events like kv_result, realtime_result)
    private readonly Dictionary<string, Action<JsonElement?>> _handlers =
        new(StringComparer.OrdinalIgnoreCase);

    // ── Singleton ─────────────────────────────────────────────────────────────

    private static IpcChannel? _instance;
    private static readonly object _instanceLock = new();

    internal static IpcChannel Instance
    {
        get
        {
            if (_instance is null)
            {
                lock (_instanceLock)
                {
                    _instance ??= new IpcChannel();
                }
            }
            return _instance;
        }
    }

    private IpcChannel()
    {
        var testingMode = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("INVOKE_TESTING_MODE"));
        var testingHost = Environment.GetEnvironmentVariable("INVOKE_TESTING_MODE_HOST");

        if (testingMode && !string.IsNullOrEmpty(testingHost))
        {
            // Testing mode: connect via TCP instead of the Unix domain socket.
            // The CLI listens on a random TCP port and passes the address via
            // INVOKE_TESTING_MODE_HOST=127.0.0.1:<port>.
            var lastColon = testingHost.LastIndexOf(':');
            var host = testingHost[..lastColon];
            var port = int.Parse(testingHost[(lastColon + 1)..]);
            _socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
            _socket.Connect(new IPEndPoint(IPAddress.Parse(host), port));
        }
        else
        {
            _socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            _socket.Connect(new UnixDomainSocketEndPoint(SocketPath));
        }

        _stream = new NetworkStream(_socket, ownsSocket: false);
        _reader = new StreamReader(_stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, 4096, leaveOpen: true);

        // Start background read loop
        _ = Task.Run(ReadLoopAsync);
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /// <summary>Send a JSON-framed event to the host with a typed, AOT-safe payload.</summary>
    internal async Task SendAsync<TPayload>(string eventName, TPayload payload,
        JsonTypeInfo<IpcOutboundFrame<TPayload>> typeInfo)
    {
        var frame = new IpcOutboundFrame<TPayload> { Event = eventName, Payload = payload };
        var json = System.Text.Json.JsonSerializer.Serialize(frame, typeInfo);
        var bytes = Encoding.UTF8.GetBytes(json + "\n");

        await _writeLock.WaitAsync();
        try
        {
            await _stream.WriteAsync(bytes);
            await _stream.FlushAsync();
        }
        finally
        {
            _writeLock.Release();
        }
    }

    /// <summary>Send an event with no payload.</summary>
    internal Task SendAsync(string eventName)
        => SendAsync(eventName, new IpcEmptyPayload(), IpcJsonContext.Default.IpcOutboundFrameIpcEmptyPayload);

    /// <summary>Send a final event and half-close the socket.</summary>
    internal async Task EndAsync<TPayload>(string eventName, TPayload payload,
        JsonTypeInfo<IpcOutboundFrame<TPayload>> typeInfo)
    {
        await SendAsync(eventName, payload, typeInfo);
        _socket.Shutdown(SocketShutdown.Send);
    }

    /// <summary>Send a final event with no payload and half-close the socket.</summary>
    internal async Task EndAsync(string eventName)
    {
        await SendAsync(eventName);
        _socket.Shutdown(SocketShutdown.Send);
    }

    // ── Read loop ─────────────────────────────────────────────────────────────

    private async Task ReadLoopAsync()
    {
        try
        {
            while (true)
            {
                var line = await _reader.ReadLineAsync();
                if (line is null) break; // EOF — host closed connection

                IpcFrame? frame;
                try
                {
                    frame = JsonSerializer.Deserialize(line, IpcJsonContext.Default.IpcFrame);
                }
                catch
                {
                    continue; // skip malformed lines
                }

                if (frame is null) continue;

                var eventName = frame.Event;
                var payload = frame.Payload;

                // Dispatch to continuous handlers first
                Action<JsonElement?>? handler;
                lock (_lock)
                {
                    _handlers.TryGetValue(eventName, out handler);
                }
                handler?.Invoke(payload);

                // Then resolve one-shot waiters
                List<TaskCompletionSource<JsonElement?>>? waiters;
                lock (_lock)
                {
                    if (_pending.TryGetValue(eventName, out waiters))
                        _pending.Remove(eventName);
                }
                if (waiters is not null)
                {
                    foreach (var tcs in waiters)
                        tcs.TrySetResult(payload);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[invoke-sdk] IPC read loop error: {ex.Message}");
        }
    }

    // ── Await helpers ─────────────────────────────────────────────────────────

    /// <summary>
    /// Wait for the next occurrence of <paramref name="eventName"/> and return
    /// its payload.
    /// </summary>
    internal Task<JsonElement?> WaitForAsync(string eventName)
    {
        var tcs = new TaskCompletionSource<JsonElement?>(
            TaskCreationOptions.RunContinuationsAsynchronously);

        lock (_lock)
        {
            if (!_pending.TryGetValue(eventName, out var list))
            {
                list = [];
                _pending[eventName] = list;
            }
            list.Add(tcs);
        }

        return tcs.Task;
    }

    /// <summary>
    /// Register a continuous callback for repeating events (e.g. <c>kv_result</c>).
    /// Only one handler per event name is supported.
    /// </summary>
    internal void On(string eventName, Action<JsonElement?> handler)
    {
        lock (_lock)
        {
            _handlers[eventName] = handler;
        }
    }

    public void Dispose()
    {
        _reader.Dispose();
        _stream.Dispose();
        _socket.Dispose();
        _writeLock.Dispose();
    }
}
