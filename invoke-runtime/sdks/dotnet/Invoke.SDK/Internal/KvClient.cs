using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace Invoke.Internal;

/// <summary>
/// KV store client — forwards operations to the host over IPC.
/// Mirrors the TypeScript <c>KvClient</c> in <c>kv/client.ts</c>.
/// </summary>
internal sealed class KvClient
{
    private readonly IpcChannel _ipc;
    private int _seq;

    private readonly Dictionary<string, TaskCompletionSource<KvResult>> _pending =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();

    // ── Singleton ─────────────────────────────────────────────────────────────

    private static KvClient? _instance;
    private static readonly object _instanceLock = new();

    internal static KvClient Instance
    {
        get
        {
            if (_instance is null)
                lock (_instanceLock)
                    _instance ??= new KvClient(IpcChannel.Instance);
            return _instance;
        }
    }

    internal KvClient(IpcChannel ipc)
    {
        _ipc = ipc;
        _ipc.On("kv_result", OnResult);
    }

    private void OnResult(JsonElement? payload)
    {
        if (payload is null) return;

        string? id = null;
        object? value = null;
        string? error = null;

        if (payload.Value.TryGetProperty("id", out var idEl))
            id = idEl.GetString();
        if (payload.Value.TryGetProperty("value", out var valEl))
            value = valEl.ValueKind == JsonValueKind.Null ? null : valEl;
        if (payload.Value.TryGetProperty("error", out var errEl))
            error = errEl.GetString();

        if (id is null) return;

        TaskCompletionSource<KvResult>? tcs;
        lock (_lock)
        {
            if (!_pending.TryGetValue(id, out tcs)) return;
            _pending.Remove(id);
        }

        tcs.TrySetResult(new KvResult { Value = value, Error = error });
    }

    private string NextId() => $"kv-{System.Threading.Interlocked.Increment(ref _seq)}";

    private async Task<KvResult> RequestAsync<TPayload>(string id, string eventName, TPayload payload,
        JsonTypeInfo<IpcOutboundFrame<TPayload>> typeInfo)
    {
        var tcs = new TaskCompletionSource<KvResult>(
            TaskCreationOptions.RunContinuationsAsynchronously);

        lock (_lock) { _pending[id] = tcs; }

        await _ipc.SendAsync(eventName, payload, typeInfo);
        return await tcs.Task;
    }

    // ── Public operations ─────────────────────────────────────────────────────

    internal async Task<object?> GetAsync(string key)
    {
        var id = NextId();
        var result = await RequestAsync(id, "kv_get",
            new IpcKvGetPayload { Id = id, Key = key },
            IpcJsonContext.Default.IpcOutboundFrameIpcKvGetPayload);
        if (result.Error is not null) throw new InvalidOperationException($"KV get error: {result.Error}");
        return UnwrapElement(result.Value);
    }

    internal async Task SetAsync(string key, object? value, long? ttlMs)
    {
        var id = NextId();
        // Serialize value as a JSON string, mirroring JS JSON.stringify(value).
        // The host's onKvSet handler calls JSON.parse(payload.value) to recover the value.
        string valueJson = value is null ? "null" :
            value is JsonElement je ? je.GetRawText() :
            System.Text.Json.JsonSerializer.Serialize(value, value.GetType(), IpcJsonContext.Default);
        var result = await RequestAsync(id, "kv_set",
            new IpcKvSetPayload { Id = id, Key = key, Value = valueJson, Ttl = ttlMs },
            IpcJsonContext.Default.IpcOutboundFrameIpcKvSetPayload);
        if (result.Error is not null) throw new InvalidOperationException($"KV set error: {result.Error}");
    }

    internal async Task DeleteAsync(string key)
    {
        var id = NextId();
        var result = await RequestAsync(id, "kv_delete",
            new IpcKvDeletePayload { Id = id, Key = key },
            IpcJsonContext.Default.IpcOutboundFrameIpcKvDeletePayload);
        if (result.Error is not null) throw new InvalidOperationException($"KV delete error: {result.Error}");
    }

    internal async Task<string[]> ListAsync(string? prefix)
    {
        var id = NextId();
        var result = await RequestAsync(id, "kv_list",
            new IpcKvListPayload { Id = id, Prefix = prefix },
            IpcJsonContext.Default.IpcOutboundFrameIpcKvListPayload);
        if (result.Error is not null) throw new InvalidOperationException($"KV list error: {result.Error}");
        if (result.Value is JsonElement el && el.ValueKind == JsonValueKind.Array)
        {
            var list = new List<string>();
            foreach (var item in el.EnumerateArray())
                list.Add(item.GetString() ?? string.Empty);
            return list.ToArray();
        }
        return Array.Empty<string>();
    }

    private static object? UnwrapElement(object? raw)
    {
        if (raw is JsonElement el)
        {
            return el.ValueKind switch
            {
                JsonValueKind.String => el.GetString(),
                JsonValueKind.Number when el.TryGetDouble(out var d) => d,
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => el // return the element as-is for objects/arrays
            };
        }
        return raw;
    }

    private sealed class KvResult
    {
        public object? Value { get; init; }
        public string? Error { get; init; }
    }
}
