using System.Text.Json.Nodes;
using Invoke.Internal;

namespace Invoke;

/// <summary>
/// Incoming HTTP request passed to every Invoke function handler.
/// Mirrors the <c>RequestData</c> shape sent from the worker host over IPC.
/// </summary>
public sealed class InvokeRequest
{
    /// <summary>HTTP method in upper-case (e.g. <c>"GET"</c>, <c>"POST"</c>).</summary>
    public string Method { get; internal set; } = string.Empty;

    /// <summary>Full request URL including query string.</summary>
    public string Url { get; internal set; } = string.Empty;

    /// <summary>Unmodified original request URL.</summary>
    public string OriginalUrl { get; internal set; } = string.Empty;

    /// <summary>URL pathname without the query string.</summary>
    public string Path { get; internal set; } = string.Empty;

    /// <summary>Request protocol: <c>"http"</c> or <c>"https"</c>.</summary>
    public string Protocol { get; internal set; } = "http";

    /// <summary>Hostname from the <c>Host</c> header, without the port.</summary>
    public string Hostname { get; internal set; } = string.Empty;

    /// <summary><c>true</c> when the connection uses TLS.</summary>
    public bool Secure { get; internal set; }

    /// <summary>Remote IP address of the client.</summary>
    public string Ip { get; internal set; } = string.Empty;

    /// <summary>List of IP addresses from the <c>X-Forwarded-For</c> header, nearest-first.</summary>
    public IReadOnlyList<string> Ips { get; internal set; } = Array.Empty<string>();

    /// <summary>Parsed request body. Value depends on the content type.</summary>
    public JsonNode? Body { get; internal set; }

    /// <summary>Parsed query-string parameters.</summary>
    public IReadOnlyDictionary<string, string> Query { get; internal set; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Route parameters extracted by the router (e.g. <c>Params["id"]</c>).</summary>
    public IReadOnlyDictionary<string, string> Params { get; internal set; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Incoming request headers (all names are lower-cased).</summary>
    public IReadOnlyDictionary<string, string> Headers { get; internal set; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Parsed cookies from the <c>Cookie</c> header.</summary>
    public IReadOnlyDictionary<string, string> Cookies { get; internal set; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Read a request header value by name (case-insensitive).</summary>
    public string? GetHeader(string name) =>
        Headers.TryGetValue(name.ToLowerInvariant(), out var v) ? v : null;

    /// <summary>Called by the Router source-generated <c>Main</c> to inject matched params.</summary>
    public void SetParams(IReadOnlyDictionary<string, string> @params) => Params = @params;

    internal static InvokeRequest FromIpc(IpcRequestData data)
    {
        var req = new InvokeRequest
        {
            Method = data.Method ?? "GET",
            Url = data.Url ?? "/",
            OriginalUrl = data.OriginalUrl ?? "/",
            Path = data.Path ?? "/",
            Protocol = data.Protocol ?? "http",
            Hostname = data.Hostname ?? string.Empty,
            Secure = data.Secure,
            Ip = data.Ip ?? string.Empty,
            Ips = data.Ips ?? Array.Empty<string>(),
            Body = ParseBody(data.Body),
            Query = data.Query ?? new Dictionary<string, string>(),
            Params = data.Params ?? new Dictionary<string, string>(),
            Headers = NormalisedHeaders(data.Headers),
        };

        req.Cookies = ParseCookies(req.GetHeader("cookie"));
        return req;
    }

    private static JsonNode? ParseBody(object? raw)
    {
        if (raw is null) return null;
        if (raw is JsonNode node) return node;
        // Body arrived as a plain System.Text.Json JsonElement via source-gen deserialization
        if (raw is System.Text.Json.JsonElement el)
            return JsonNode.Parse(el.GetRawText());
        return null;
    }

    private static IReadOnlyDictionary<string, string> NormalisedHeaders(
        IReadOnlyDictionary<string, string>? headers)
    {
        if (headers is null) return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var result = new Dictionary<string, string>(headers.Count, StringComparer.OrdinalIgnoreCase);
        foreach (var kv in headers) result[kv.Key.ToLowerInvariant()] = kv.Value;
        return result;
    }

    private static IReadOnlyDictionary<string, string> ParseCookies(string? cookieHeader)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrEmpty(cookieHeader)) return result;

        foreach (var pair in cookieHeader.Split(';'))
        {
            var idx = pair.IndexOf('=');
            if (idx <= 0) continue;
            var key = pair[..idx].Trim();
            var val = pair[(idx + 1)..].Trim();
            result[key] = Uri.UnescapeDataString(val);
        }
        return result;
    }
}
