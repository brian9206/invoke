using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace Invoke;

/// <summary>
/// Outgoing HTTP response with a fluent builder API, mirroring the Express.js
/// <c>InvokeResponse</c> from the JavaScript SDK.
/// </summary>
public sealed class InvokeResponse
{
    private int _statusCode = 200;
    private readonly Dictionary<string, List<string>> _headers = new(StringComparer.OrdinalIgnoreCase);
    private byte[]? _body;
    private bool _finished;

    // ── Status ────────────────────────────────────────────────────────────────

    /// <summary>Current HTTP status code.</summary>
    public int StatusCode => _statusCode;

    /// <summary>Set the HTTP status code.</summary>
    public InvokeResponse Status(int code)
    {
        _statusCode = code;
        return this;
    }

    // ── Headers ───────────────────────────────────────────────────────────────

    /// <summary>Set a response header (overwrites any existing value).</summary>
    public InvokeResponse SetHeader(string name, string value)
    {
        _headers[name] = [value];
        return this;
    }

    /// <summary>Append a value to a response header.</summary>
    public InvokeResponse AppendHeader(string name, string value)
    {
        if (!_headers.TryGetValue(name, out var list))
        {
            list = [];
            _headers[name] = list;
        }
        list.Add(value);
        return this;
    }

    /// <summary>Set the <c>Content-Type</c> header.</summary>
    public InvokeResponse Type(string contentType)
    {
        SetHeader("content-type", contentType);
        return this;
    }

    // ── Body senders ──────────────────────────────────────────────────────────

    /// <summary>Send a JSON response body.</summary>
    [RequiresUnreferencedCode("JSON serialization of arbitrary types may not be compatible with trimming. Use the Json<T>(T, JsonTypeInfo<T>) overload for AOT-safe usage.")]
    [RequiresDynamicCode("JSON serialization of arbitrary types may require dynamic code generation. Use the Json<T>(T, JsonTypeInfo<T>) overload for AOT-safe usage.")]
    public InvokeResponse Json(object? data, JsonSerializerOptions? options = null)
    {
        SetHeader("content-type", "application/json; charset=utf-8");
        var json = JsonSerializer.Serialize(data, options ?? InvokeJsonOptions.Default);
        return End(Encoding.UTF8.GetBytes(json));
    }

    /// <summary>Send a JSON response body using a source-generated <see cref="JsonTypeInfo{T}"/> (AOT-safe).</summary>
    public InvokeResponse Json<T>(T data, JsonTypeInfo<T> typeInfo)
    {
        SetHeader("content-type", "application/json; charset=utf-8");
        var json = JsonSerializer.Serialize(data, typeInfo);
        return End(Encoding.UTF8.GetBytes(json));
    }

    /// <summary>Send a JSON response body from a <see cref="JsonNode"/>.</summary>
    public InvokeResponse Json(JsonNode? node)
    {
        SetHeader("content-type", "application/json; charset=utf-8");
        var json = node?.ToJsonString() ?? "null";
        return End(Encoding.UTF8.GetBytes(json));
    }

    /// <summary>Send a plain-text response body.</summary>
    public InvokeResponse Send(string text)
    {
        if (!_headers.ContainsKey("content-type"))
            SetHeader("content-type", "text/plain; charset=utf-8");
        return End(Encoding.UTF8.GetBytes(text));
    }

    /// <summary>Send raw bytes as the response body.</summary>
    public InvokeResponse Send(byte[] data)
    {
        return End(data);
    }

    /// <summary>Send the default HTTP status message for the current code.</summary>
    public InvokeResponse SendStatus(int code)
    {
        Status(code);
        var msg = GetStatusMessage(code);
        SetHeader("content-type", "text/plain; charset=utf-8");
        return End(Encoding.UTF8.GetBytes(msg));
    }

    /// <summary>Finish the response with an empty body.</summary>
    public InvokeResponse End()
    {
        _finished = true;
        return this;
    }

    private InvokeResponse End(byte[] data)
    {
        _body = data;
        _finished = true;
        return this;
    }

    // ── Redirect ──────────────────────────────────────────────────────────────

    /// <summary>Send an HTTP redirect response.</summary>
    public InvokeResponse Redirect(string url, int code = 302)
    {
        Status(code);
        SetHeader("location", url);
        return End(Encoding.UTF8.GetBytes($"Redirecting to {url}"));
    }

    // ── Serialisation (internal) ──────────────────────────────────────────────

    /// <summary>Collect headers into the wire format.</summary>
    internal Dictionary<string, object> GetHeaders()
    {
        var result = new Dictionary<string, object>(_headers.Count, StringComparer.OrdinalIgnoreCase);
        foreach (var kv in _headers)
        {
            if (kv.Value.Count == 1)
                result[kv.Key] = kv.Value[0];
            else
                result[kv.Key] = kv.Value.ToArray();
        }
        return result;
    }

    internal byte[]? GetBody() => _body;

    internal bool IsFinished => _finished;

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string GetStatusMessage(int code) => code switch
    {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        301 => "Moved Permanently",
        302 => "Found",
        304 => "Not Modified",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        422 => "Unprocessable Entity",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Unknown"
    };
}

/// <summary>Default JSON serializer options used by <see cref="InvokeResponse.Json(object?,JsonSerializerOptions?)"/>.</summary>
internal static class InvokeJsonOptions
{
    internal static readonly JsonSerializerOptions Default = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}
