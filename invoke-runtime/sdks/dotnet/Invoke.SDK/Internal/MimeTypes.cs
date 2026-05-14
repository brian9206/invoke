namespace Invoke.Internal;

/// <summary>
/// Minimal MIME type lookup by file extension, covering common web asset types.
/// Mirrors the behaviour of the <c>mime-types</c> npm package used in the JS SDK.
/// </summary>
internal static class MimeTypes
{
    // Keys are lower-case extensions including the leading dot.
    private static readonly Dictionary<string, string> Map = new(StringComparer.OrdinalIgnoreCase)
    {
        // ── Text ──────────────────────────────────────────────────────────────
        { ".html",  "text/html; charset=utf-8" },
        { ".htm",   "text/html; charset=utf-8" },
        { ".css",   "text/css; charset=utf-8" },
        { ".js",    "application/javascript; charset=utf-8" },
        { ".mjs",   "application/javascript; charset=utf-8" },
        { ".cjs",   "application/javascript; charset=utf-8" },
        { ".ts",    "application/typescript; charset=utf-8" },
        { ".json",  "application/json; charset=utf-8" },
        { ".jsonl", "application/x-ndjson; charset=utf-8" },
        { ".xml",   "application/xml; charset=utf-8" },
        { ".txt",   "text/plain; charset=utf-8" },
        { ".csv",   "text/csv; charset=utf-8" },
        { ".md",    "text/markdown; charset=utf-8" },
        { ".yaml",  "text/yaml; charset=utf-8" },
        { ".yml",   "text/yaml; charset=utf-8" },
        { ".ics",   "text/calendar; charset=utf-8" },
        { ".vcf",   "text/vcard; charset=utf-8" },

        // ── Images ────────────────────────────────────────────────────────────
        { ".png",   "image/png" },
        { ".jpg",   "image/jpeg" },
        { ".jpeg",  "image/jpeg" },
        { ".gif",   "image/gif" },
        { ".webp",  "image/webp" },
        { ".svg",   "image/svg+xml" },
        { ".ico",   "image/x-icon" },
        { ".bmp",   "image/bmp" },
        { ".tiff",  "image/tiff" },
        { ".tif",   "image/tiff" },
        { ".avif",  "image/avif" },
        { ".apng",  "image/apng" },

        // ── Audio / Video ─────────────────────────────────────────────────────
        { ".mp3",   "audio/mpeg" },
        { ".mp4",   "video/mp4" },
        { ".m4v",   "video/mp4" },
        { ".m4a",   "audio/mp4" },
        { ".webm",  "video/webm" },
        { ".ogg",   "audio/ogg" },
        { ".oga",   "audio/ogg" },
        { ".ogv",   "video/ogg" },
        { ".wav",   "audio/wav" },
        { ".aac",   "audio/aac" },
        { ".flac",  "audio/flac" },
        { ".avi",   "video/x-msvideo" },
        { ".mov",   "video/quicktime" },
        { ".mkv",   "video/x-matroska" },

        // ── Fonts ─────────────────────────────────────────────────────────────
        { ".ttf",   "font/ttf" },
        { ".otf",   "font/otf" },
        { ".woff",  "font/woff" },
        { ".woff2", "font/woff2" },
        { ".eot",   "application/vnd.ms-fontobject" },

        // ── Application ───────────────────────────────────────────────────────
        { ".pdf",   "application/pdf" },
        { ".zip",   "application/zip" },
        { ".gz",    "application/gzip" },
        { ".tar",   "application/x-tar" },
        { ".7z",    "application/x-7z-compressed" },
        { ".rar",   "application/x-rar-compressed" },
        { ".wasm",  "application/wasm" },
        { ".bin",   "application/octet-stream" },
        { ".exe",   "application/octet-stream" },
        { ".dll",   "application/octet-stream" },
    };

    /// <summary>
    /// Return the MIME type string for the given file path (by extension), or
    /// <see langword="null"/> when the extension is absent or unknown.
    /// </summary>
    internal static string? GetMimeType(string filePath)
    {
        var ext = Path.GetExtension(filePath);
        if (string.IsNullOrEmpty(ext))
            return null;

        return Map.TryGetValue(ext, out var mimeType) ? mimeType : null;
    }
}
