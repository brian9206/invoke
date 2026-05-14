namespace Invoke;

/// <summary>Base class for HTTP route attributes.</summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
public abstract class HttpMethodAttribute : Attribute
{
    /// <summary>The route pattern (e.g. <c>"/"</c>, <c>"/users/:id"</c>).</summary>
    public string Path { get; }

    protected HttpMethodAttribute(string path)
    {
        Path = path;
    }
}

/// <summary>Maps an HTTP GET request to the decorated method.</summary>
public sealed class HttpGetAttribute : HttpMethodAttribute
{
    public HttpGetAttribute(string path = "/") : base(path) { }
}

/// <summary>Maps an HTTP POST request to the decorated method.</summary>
public sealed class HttpPostAttribute : HttpMethodAttribute
{
    public HttpPostAttribute(string path = "/") : base(path) { }
}

/// <summary>Maps an HTTP PUT request to the decorated method.</summary>
public sealed class HttpPutAttribute : HttpMethodAttribute
{
    public HttpPutAttribute(string path = "/") : base(path) { }
}

/// <summary>Maps an HTTP PATCH request to the decorated method.</summary>
public sealed class HttpPatchAttribute : HttpMethodAttribute
{
    public HttpPatchAttribute(string path = "/") : base(path) { }
}

/// <summary>Maps an HTTP DELETE request to the decorated method.</summary>
public sealed class HttpDeleteAttribute : HttpMethodAttribute
{
    public HttpDeleteAttribute(string path = "/") : base(path) { }
}

/// <summary>Maps an HTTP OPTIONS request to the decorated method.</summary>
public sealed class HttpOptionsAttribute : HttpMethodAttribute
{
    public HttpOptionsAttribute(string path = "/") : base(path) { }
}
