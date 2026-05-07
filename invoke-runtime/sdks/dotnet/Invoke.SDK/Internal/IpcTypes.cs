using System.Text.Json.Serialization;

namespace Invoke.Internal;

/// <summary>
/// Wire-format request object as received from the host over IPC.
/// Mirrors the <c>RequestData</c> TypeScript interface in <c>protocol.ts</c>.
/// </summary>
internal sealed class IpcRequestData
{
    [JsonPropertyName("method")]
    public string? Method { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("originalUrl")]
    public string? OriginalUrl { get; set; }

    [JsonPropertyName("path")]
    public string? Path { get; set; }

    [JsonPropertyName("protocol")]
    public string? Protocol { get; set; }

    [JsonPropertyName("hostname")]
    public string? Hostname { get; set; }

    [JsonPropertyName("secure")]
    public bool Secure { get; set; }

    [JsonPropertyName("ip")]
    public string? Ip { get; set; }

    [JsonPropertyName("ips")]
    public string[]? Ips { get; set; }

    [JsonPropertyName("body")]
    public object? Body { get; set; }

    [JsonPropertyName("query")]
    public Dictionary<string, string>? Query { get; set; }

    [JsonPropertyName("params")]
    public Dictionary<string, string>? Params { get; set; }

    [JsonPropertyName("headers")]
    public Dictionary<string, string>? Headers { get; set; }
}

/// <summary>
/// Wire-format response object sent back to the host over IPC.
/// Mirrors the <c>ResponseData</c> TypeScript interface.
/// </summary>
internal sealed class IpcResponseData
{
    [JsonPropertyName("statusCode")]
    public int StatusCode { get; set; }

    [JsonPropertyName("headers")]
    public Dictionary<string, object> Headers { get; set; } = new();

    /// <summary>Base64-encoded body bytes, or <c>null</c> for empty body.</summary>
    [JsonPropertyName("body")]
    public string? Body { get; set; }
}

/// <summary>Wire-format envelope for all IPC frames.</summary>
internal sealed class IpcFrame
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = string.Empty;

    [JsonPropertyName("payload")]
    public System.Text.Json.JsonElement? Payload { get; set; }
}

/// <summary>Wire-format payload for the <c>payload</c> event from the host.</summary>
internal sealed class IpcPayload
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("request")]
    public IpcRequestData? Request { get; set; }

    /// <summary>Socket.IO event dispatched for realtime executions.</summary>
    [JsonPropertyName("event")]
    public string? RealtimeEvent { get; set; }

    [JsonPropertyName("socketId")]
    public string? SocketId { get; set; }

    [JsonPropertyName("namespace")]
    public string? Namespace { get; set; }

    /// <summary>Realtime event payload (single argument).</summary>
    [JsonPropertyName("args")]
    public System.Text.Json.JsonElement[]? Args { get; set; }

    [JsonPropertyName("buildId")]
    public string? BuildId { get; set; }
}

// ── Outbound payload types (used for source-gen serialization) ────────────────

/// <summary>Top-level outbound IPC frame sent to the host.</summary>
internal sealed class IpcOutboundFrame<TPayload>
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = string.Empty;

    [JsonPropertyName("payload")]
    public TPayload? Payload { get; set; }
}

/// <summary>Payload for <c>execute_result</c> event.</summary>
internal sealed class IpcExecuteResultPayload
{
    [JsonPropertyName("response")]
    public IpcResponseData? Response { get; set; }
}

/// <summary>Payload for <c>worker_error</c> event.</summary>
internal sealed class IpcWorkerErrorPayload
{
    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

/// <summary>Payload for <c>console_log</c> event.</summary>
internal sealed class IpcConsoleLogPayload
{
    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("args")]
    public string[]? Args { get; set; }
}

/// <summary>Payload for <c>kv_get</c> event.</summary>
internal sealed class IpcKvGetPayload
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("key")]
    public string? Key { get; set; }
}

/// <summary>Payload for <c>kv_set</c> event.</summary>
internal sealed class IpcKvSetPayload
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("key")]
    public string? Key { get; set; }

    [JsonPropertyName("value")]
    public string? Value { get; set; }

    [JsonPropertyName("ttl")]
    public long? Ttl { get; set; }
}

/// <summary>Payload for <c>kv_delete</c> event.</summary>
internal sealed class IpcKvDeletePayload
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("key")]
    public string? Key { get; set; }
}

/// <summary>Payload for <c>kv_list</c> event.</summary>
internal sealed class IpcKvListPayload
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("prefix")]
    public string? Prefix { get; set; }
}

/// <summary>Empty payload (for events with no payload data, e.g. <c>payload</c> request).</summary>
internal sealed class IpcEmptyPayload { }

/// <summary>Outer payload for the <c>realtime_cmd</c> event.</summary>
internal sealed class IpcRealtimeCmdPayload
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("cmd")]
    public IpcRealtimeCmd? Cmd { get; set; }
}

/// <summary>Inner realtime command (broadcast or emit-to-rooms).</summary>
internal sealed class IpcRealtimeCmd
{
    [JsonPropertyName("action")]
    public string? Action { get; set; }

    [JsonPropertyName("namespace")]
    public string? Namespace { get; set; }

    [JsonPropertyName("event")]
    public string? Event { get; set; }

    [JsonPropertyName("rooms")]
    public string[]? Rooms { get; set; }

    [JsonPropertyName("except")]
    public string[]? Except { get; set; }

    [JsonPropertyName("args")]
    public System.Text.Json.Nodes.JsonNode?[]? Args { get; set; }
}
