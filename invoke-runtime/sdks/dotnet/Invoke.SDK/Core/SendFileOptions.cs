namespace Invoke;

/// <summary>
/// Options for <see cref="InvokeResponse.SendFile"/> and <see cref="InvokeResponse.Download"/>.
/// Mirrors the <c>SendFileOptions</c> interface from the JavaScript SDK.
/// </summary>
public sealed class SendFileOptions
{
    /// <summary>Root directory to resolve the file path against. Defaults to <c>"/"</c>.</summary>
    public string? Root { get; set; }

    /// <summary>Cache max-age in milliseconds for the <c>Cache-Control: public, max-age=N</c> header.</summary>
    public int? MaxAge { get; set; }

    /// <summary>
    /// Whether to emit a <c>Cache-Control</c> header when <see cref="MaxAge"/> is set.
    /// Defaults to <c>true</c>.
    /// </summary>
    public bool CacheControl { get; set; } = true;

    /// <summary>
    /// Whether to set the <c>Last-Modified</c> header from the file's last-write time.
    /// Defaults to <c>true</c>.
    /// </summary>
    public bool LastModified { get; set; } = true;

    /// <summary>Additional response headers to merge into the response.</summary>
    public Dictionary<string, string>? Headers { get; set; }
}
