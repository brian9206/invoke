namespace Invoke;

/// <summary>
/// Abstract base class for HTTP routing.  Subclass it, annotate it with
/// <see cref="EntryPointAttribute"/>, mark the class <c>partial</c>, then
/// decorate individual methods with <see cref="HttpGetAttribute"/>,
/// <see cref="HttpPostAttribute"/>, etc.
///
/// The source generator will emit an implementation of <see cref="Main"/> that
/// routes incoming requests to the correct method.
///
/// <code>
/// [EntryPoint]
/// public partial class App : Router
/// {
///     [HttpGet("/")]
///     public async Task Index(InvokeRequest req, InvokeResponse res)
///     {
///         res.Status(200).Json(new { hello = "world" });
///     }
/// }
/// </code>
/// </summary>
public abstract partial class Router : IEntryPoint
{
    /// <summary>
    /// Dispatches the incoming request to the matching route handler.
    /// Implemented by the source generator for <c>partial</c> subclasses.
    /// </summary>
    public abstract Task Main(InvokeRequest req, InvokeResponse res);
}
