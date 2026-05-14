using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Invoke.Internal;

/// <summary>
/// AOT-safe JSON serialization contexts for internal IPC protocol types.
/// All types that cross the IPC boundary must be registered here.
/// </summary>
[JsonSerializable(typeof(IpcFrame))]
[JsonSerializable(typeof(IpcPayload))]
[JsonSerializable(typeof(IpcRequestData))]
[JsonSerializable(typeof(IpcResponseData))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcEmptyPayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcExecuteResultPayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcWorkerErrorPayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcConsolePayload>))]
[JsonSerializable(typeof(JsonObject))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcKvGetPayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcKvSetPayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcKvDeletePayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcKvListPayload>))]
[JsonSerializable(typeof(IpcOutboundFrame<IpcRealtimeCmdPayload>))]
[JsonSerializable(typeof(object))]
[JsonSerializable(typeof(string[]))]
[JsonSerializable(typeof(Dictionary<string, string>))]
[JsonSerializable(typeof(Dictionary<string, object>))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
internal sealed partial class IpcJsonContext : JsonSerializerContext
{
}
