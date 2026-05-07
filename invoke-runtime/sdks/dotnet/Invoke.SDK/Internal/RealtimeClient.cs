using System.Text.Json;

namespace Invoke.Internal;

/// <summary>
/// Realtime client — forwards socket commands to the host over IPC.
/// Mirrors the TypeScript <c>RealtimeClient</c> in <c>realtime/client.ts</c>.
/// </summary>
internal sealed class RealtimeClient
{
    private readonly IpcChannel _ipc;
    private int _seq;

    private readonly Dictionary<string, TaskCompletionSource<RealtimeResult>> _pending =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();

    // ── Singleton ─────────────────────────────────────────────────────────────

    private static RealtimeClient? _instance;
    private static readonly object _instanceLock = new();

    internal static RealtimeClient Instance
    {
        get
        {
            if (_instance is null)
                lock (_instanceLock)
                    _instance ??= new RealtimeClient(IpcChannel.Instance);
            return _instance;
        }
    }

    internal RealtimeClient(IpcChannel ipc)
    {
        _ipc = ipc;
        _ipc.On("realtime_result", OnResult);
    }

    private void OnResult(JsonElement? payload)
    {
        if (payload is null) return;

        string? id = null;
        string? error = null;

        if (payload.Value.TryGetProperty("id", out var idEl))
            id = idEl.GetString();
        if (payload.Value.TryGetProperty("error", out var errEl))
            error = errEl.GetString();

        if (id is null) return;

        TaskCompletionSource<RealtimeResult>? tcs;
        lock (_lock)
        {
            if (!_pending.TryGetValue(id, out tcs)) return;
            _pending.Remove(id);
        }

        tcs.TrySetResult(new RealtimeResult { Error = error });
    }

    private string NextId() => $"rt-{System.Threading.Interlocked.Increment(ref _seq)}";

    internal async Task SendAsync(IpcRealtimeCmd cmd)
    {
        var id = NextId();
        var tcs = new TaskCompletionSource<RealtimeResult>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_lock) { _pending[id] = tcs; }

        await _ipc.SendAsync("realtime_cmd",
            new IpcRealtimeCmdPayload { Id = id, Cmd = cmd },
            IpcJsonContext.Default.IpcOutboundFrameIpcRealtimeCmdPayload);

        var result = await tcs.Task;
        if (result.Error is not null)
            throw new InvalidOperationException($"Realtime command failed: {result.Error}");
    }

    private sealed class RealtimeResult
    {
        public string? Error { get; init; }
    }
}
