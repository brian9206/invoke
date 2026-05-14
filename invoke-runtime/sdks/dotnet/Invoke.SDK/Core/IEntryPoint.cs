namespace Invoke;

/// <summary>
/// Contract for class-based Invoke function handlers.
/// Apply <see cref="EntryPointAttribute"/> to the implementing class and the
/// source generator will produce the program entry point automatically.
/// </summary>
public interface IEntryPoint
{
    /// <summary>Handle one HTTP invocation.</summary>
    Task Main(InvokeRequest req, InvokeResponse res);
}
