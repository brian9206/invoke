using System.Text.Json.Nodes;
using Invoke.Internal;

namespace Invoke;

/// <summary>
/// Base class for Socket.IO-style realtime event handlers.
///
/// Subclass it, annotate it with <see cref="EntryPointAttribute"/>, mark the
/// class <c>partial</c>, and decorate individual methods with
/// <see cref="RealtimeEventAttribute"/>.  The source generator will emit the
/// <see cref="DispatchEvent"/> implementation.
///
/// Set the <see cref="Namespace"/> property in your constructor to bind to a
/// Socket.IO namespace path (e.g. <c>"/echo"</c>).
///
/// <code>
/// [EntryPoint]
/// public partial class App : RealtimeNamespace
/// {
///     public App() { Namespace = "/echo"; }
///
///     [RealtimeEvent("echo")]
///     public async Task OnEcho(JsonNode arg)
///     {
///         await To("room").Emit("echo", arg);
///     }
/// }
/// </code>
///
/// Alternatively, create a standalone instance and use it to broadcast:
/// <code>
/// var ns = new RealtimeNamespace("/echo");
/// await ns.To("room").Emit("broadcast", JsonValue.Create("hello"));
/// </code>
/// </summary>
public partial class RealtimeNamespace
{
    private readonly RealtimeClient _client;

    /// <summary>
    /// The Socket.IO namespace path this instance is bound to (e.g. <c>"/chat"</c>).
    /// Must be set before any emit is attempted.
    /// </summary>
    public string? Namespace { get; protected set; }

    /// <summary>
    /// The Socket.IO ID of the currently-dispatching client socket.
    /// Available inside <see cref="RealtimeEventAttribute"/>-decorated handlers.
    /// </summary>
    public string? SocketId { get; internal set; }

    /// <summary>
    /// Create a namespace bound to a specific path (standalone usage).
    /// </summary>
    public RealtimeNamespace(string @namespace)
    {
        Namespace = @namespace;
        _client = RealtimeClient.Instance;
    }

    /// <summary>
    /// Default constructor for subclass usage — set <see cref="Namespace"/> in
    /// your constructor body.
    /// </summary>
    protected RealtimeNamespace()
    {
        _client = RealtimeClient.Instance;
    }

    // ── Broadcast operators ───────────────────────────────────────────────────

    /// <summary>Target a room for broadcast operations.</summary>
    public BroadcastOperator To(string room)
    {
        AssertNamespace();
        return new BroadcastOperator(_client, Namespace!, new[] { room }, Array.Empty<string>());
    }

    /// <summary>Alias of <see cref="To"/>.</summary>
    public BroadcastOperator In(string room) => To(room);

    /// <summary>Exclude a room from broadcast operations.</summary>
    public BroadcastOperator Except(string room)
    {
        AssertNamespace();
        return new BroadcastOperator(_client, Namespace!, Array.Empty<string>(), new[] { room });
    }

    /// <summary>Emit an event directly to the namespace (broadcast to all).</summary>
    public Task Emit(string @event, JsonNode? payload = null)
    {
        AssertNamespace();
        return _client.SendAsync(new Invoke.Internal.IpcRealtimeCmd
        {
            Action = "broadcast",
            Namespace = Namespace,
            Event = @event,
            Args = payload is null ? [] : [payload]
        });
    }

    // ── Event dispatch (overridden by source generator) ───────────────────────

    /// <summary>
    /// Routes a received Socket.IO event to the matching handler method.
    /// Implemented by the source generator.
    /// </summary>
    protected virtual Task DispatchEvent(string eventName, JsonNode? payload) =>
        Task.CompletedTask;

    // ── Internal ──────────────────────────────────────────────────────────────

    internal Task HandleEvent(string eventName, string socketId, JsonNode? payload)
    {
        SocketId = socketId;
        return DispatchEvent(eventName, payload);
    }

    private void AssertNamespace()
    {
        if (string.IsNullOrEmpty(Namespace))
            throw new InvalidOperationException(
                "RealtimeNamespace.Namespace must be set before performing emit operations.");
    }
}

/// <summary>
/// Chainable operator that targets a set of rooms for broadcast.
/// </summary>
public sealed class BroadcastOperator
{
    private readonly RealtimeClient _client;
    private readonly string _namespace;
    private readonly string[] _rooms;
    private readonly string[] _except;

    internal BroadcastOperator(
        RealtimeClient client,
        string @namespace,
        string[] rooms,
        string[] except)
    {
        _client = client;
        _namespace = @namespace;
        _rooms = rooms;
        _except = except;
    }

    /// <summary>Emit an event to the targeted rooms.</summary>
    public Task Emit(string @event, JsonNode? payload = null)
    {
        return _client.SendAsync(new Invoke.Internal.IpcRealtimeCmd
        {
            Action = "emit",
            Namespace = _namespace,
            Rooms = _rooms,
            Except = _except,
            Event = @event,
            Args = payload is null ? [] : [payload]
        });
    }

    /// <summary>Further restrict to an additional room.</summary>
    public BroadcastOperator To(string room) =>
        new(_client, _namespace, [.._rooms, room], _except);

    /// <summary>Exclude an additional room.</summary>
    public BroadcastOperator Except(string room) =>
        new(_client, _namespace, _rooms, [.._except, room]);
}
