using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Invoke.Internal;

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

    // ── File responses ────────────────────────────────────────────────────────

    /// <summary>
    /// Send a file as the response body, detecting its MIME type automatically.
    /// Mirrors <c>res.sendFile()</c> from the JavaScript SDK.
    /// </summary>
    /// <param name="filePath">
    /// Path to the file. When <see cref="SendFileOptions.Root"/> is set the path is resolved
    /// relative to that directory; otherwise it must be absolute.
    /// </param>
    /// <param name="options">Optional file-sending options.</param>
    public InvokeResponse SendFile(string filePath, SendFileOptions? options = null)
    {
        var root = options?.Root ?? "/";
        var resolved = Path.GetFullPath(filePath, root);

        byte[] data;
        try
        {
            data = File.ReadAllBytes(resolved);
        }
        catch (Exception ex) when (ex is FileNotFoundException || ex is DirectoryNotFoundException)
        {
            return SendStatus(404);
        }
        catch (UnauthorizedAccessException)
        {
            return SendStatus(403);
        }
        catch
        {
            return SendStatus(500);
        }

        var mimeType = MimeTypes.GetMimeType(resolved);
        if (mimeType is not null)
            SetHeader("content-type", mimeType);

        SetHeader("content-length", data.Length.ToString());

        if (options?.MaxAge is int maxAgeMs && options.CacheControl)
        {
            var maxAgeSeconds = maxAgeMs / 1000;
            SetHeader("cache-control", $"public, max-age={maxAgeSeconds}");
        }

        if (options?.LastModified != false)
        {
            try
            {
                var mtime = File.GetLastWriteTimeUtc(resolved);
                SetHeader("last-modified", mtime.ToString("R"));
            }
            catch { /* metadata unavailable — skip */ }
        }

        if (options?.Headers is { } extraHeaders)
        {
            foreach (var (key, value) in extraHeaders)
                SetHeader(key, value);
        }

        return End(data);
    }

    /// <summary>
    /// Prompt the browser to download a file as an attachment.
    /// Sets <c>Content-Disposition: attachment</c> and delegates to <see cref="SendFile"/>.
    /// Mirrors <c>res.download()</c> from the JavaScript SDK.
    /// </summary>
    /// <param name="filePath">Path to the file to send.</param>
    /// <param name="filename">Download filename shown to the user. Defaults to the file's base name.</param>
    /// <param name="options">Optional file-sending options.</param>
    public InvokeResponse Download(string filePath, string? filename = null, SendFileOptions? options = null)
    {
        Attachment(filename ?? Path.GetFileName(filePath));
        return SendFile(filePath, options);
    }

    /// <summary>
    /// Set the <c>Content-Disposition</c> header to <c>attachment</c>, optionally with a filename.
    /// Mirrors <c>res.attachment()</c> from the JavaScript SDK.
    /// </summary>
    /// <param name="filename">Optional filename. Non-ASCII names are RFC 5987–encoded.</param>
    public InvokeResponse Attachment(string? filename = null)
    {
        if (filename is { Length: > 0 })
        {
            bool needsEncoding = false;
            foreach (char c in filename)
            {
                if (c < 0x20 || c > 0x7E) { needsEncoding = true; break; }
            }

            if (needsEncoding)
            {
                var encoded = Uri.EscapeDataString(filename);
                SetHeader("content-disposition", $"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded}");
            }
            else
            {
                var escaped = filename.Replace("\"", "\\\"");
                SetHeader("content-disposition", $"attachment; filename=\"{escaped}\"");
            }
        }
        else
        {
            SetHeader("content-disposition", "attachment");
        }

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
