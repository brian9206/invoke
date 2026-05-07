namespace Invoke;

/// <summary>
/// Binds a Socket.IO event name to the decorated method inside a
/// <see cref="RealtimeNamespace"/> subclass.
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
public sealed class RealtimeEventAttribute : Attribute
{
    /// <summary>The Socket.IO event name (e.g. <c>"echo"</c>).</summary>
    public string Event { get; }

    public RealtimeEventAttribute(string @event)
    {
        Event = @event;
    }
}
