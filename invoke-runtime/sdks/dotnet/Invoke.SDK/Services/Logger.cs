using System.Text;
using System.Text.Json.Nodes;
using Invoke.Internal;

namespace Invoke;

/// <summary>
/// A child logger with persistent field bindings. Returned by
/// <see cref="Logger.GetChild(JsonObject)"/> or <see cref="Logger.GetChild(string,string)"/>.
/// All log entries emitted by this instance automatically include the bound fields in
/// the structured <c>details</c> payload sent to the host.
/// </summary>
public sealed class ChildLogger
{
    private static readonly Dictionary<string, int> LevelValues = new()
    {
        ["trace"] = 10,
        ["debug"] = 20,
        ["info"]  = 30,
        ["warn"]  = 40,
        ["error"] = 50,
        ["fatal"] = 60,
    };

    private readonly IpcChannel _ipc;
    private readonly JsonObject? _bindings;
    private string _level;

    internal ChildLogger(IpcChannel ipc, JsonObject? bindings, string level)
    {
        _ipc      = ipc;
        _bindings = bindings;
        _level    = level;
    }

    /// <summary>The minimum log level that will be emitted.</summary>
    public string Level
    {
        get => _level;
        set
        {
            if (!LevelValues.ContainsKey(value))
                throw new ArgumentException($"Unknown log level '{value}'. Valid values: trace, debug, info, warn, error, fatal");
            _level = value;
        }
    }

    /// <summary>Returns <c>true</c> if <paramref name="level"/> is at or above the current level threshold.</summary>
    public bool IsLevelEnabled(string level) =>
        LevelValues.TryGetValue(level, out var v) &&
        LevelValues.TryGetValue(_level, out var current) &&
        v >= current;

    // ── Printf formatter ───────────────────────────────────────────────────────

    private static string FormatPrintf(string fmt, object?[] args)
    {
        if (args.Length == 0) return fmt;

        var sb     = new StringBuilder();
        int argIdx = 0;
        int i      = 0;

        while (i < fmt.Length)
        {
            if (fmt[i] == '%' && i + 1 < fmt.Length && argIdx < args.Length)
            {
                char spec = fmt[i + 1];
                switch (spec)
                {
                    case 's':
                    case 'o':
                    case 'O':
                        sb.Append(args[argIdx++]?.ToString() ?? "null");
                        i += 2;
                        continue;
                    case 'd':
                    case 'i':
                        sb.Append(args[argIdx] is IConvertible c
                            ? ((int)c.ToInt64(null)).ToString()
                            : args[argIdx]?.ToString() ?? "null");
                        argIdx++;
                        i += 2;
                        continue;
                    case 'f':
                        sb.Append(args[argIdx] is IConvertible cf
                            ? cf.ToDouble(null).ToString()
                            : args[argIdx]?.ToString() ?? "null");
                        argIdx++;
                        i += 2;
                        continue;
                    case 'j':
                        sb.Append(args[argIdx] is JsonNode node
                            ? node.ToJsonString()
                            : args[argIdx]?.ToString() ?? "null");
                        argIdx++;
                        i += 2;
                        continue;
                }
            }

            sb.Append(fmt[i++]);
        }

        // Append any extra args beyond the format specifiers
        while (argIdx < args.Length)
        {
            sb.Append(' ');
            sb.Append(args[argIdx++]?.ToString() ?? "null");
        }

        return sb.ToString();
    }

    // ── Core send ──────────────────────────────────────────────────────────────

    private void SendLog(string level, string[] args, JsonObject? details)
    {
        if (!IsLevelEnabled(level)) return;

        JsonObject? merged = null;

        if (_bindings is not null || details is not null)
        {
            merged = new JsonObject();

            // Bindings are the base; explicit details override them
            if (_bindings is not null)
                foreach (var kv in _bindings)
                    merged[kv.Key] = kv.Value?.DeepClone();

            if (details is not null)
                foreach (var kv in details)
                    merged[kv.Key] = kv.Value?.DeepClone();
        }

        _ = _ipc.SendAsync(
            "console",
            new IpcConsolePayload { Level = level, Args = args, Details = merged },
            IpcJsonContext.Default.IpcOutboundFrameIpcConsolePayload);
    }

    // ── Log methods ────────────────────────────────────────────────────────────

    public void Trace(string msg, params object?[] args) =>
        SendLog("trace", [FormatPrintf(msg, args)], null);

    public void Trace(JsonObject obj, string? msg = null, params object?[] args) =>
        SendLog("trace", msg is not null ? [FormatPrintf(msg, args)] : [], obj);

    public void Debug(string msg, params object?[] args) =>
        SendLog("debug", [FormatPrintf(msg, args)], null);

    public void Debug(JsonObject obj, string? msg = null, params object?[] args) =>
        SendLog("debug", msg is not null ? [FormatPrintf(msg, args)] : [], obj);

    public void Info(string msg, params object?[] args) =>
        SendLog("info", [FormatPrintf(msg, args)], null);

    public void Info(JsonObject obj, string? msg = null, params object?[] args) =>
        SendLog("info", msg is not null ? [FormatPrintf(msg, args)] : [], obj);

    public void Warn(string msg, params object?[] args) =>
        SendLog("warn", [FormatPrintf(msg, args)], null);

    public void Warn(JsonObject obj, string? msg = null, params object?[] args) =>
        SendLog("warn", msg is not null ? [FormatPrintf(msg, args)] : [], obj);

    public void Error(string msg, params object?[] args) =>
        SendLog("error", [FormatPrintf(msg, args)], null);

    public void Error(JsonObject obj, string? msg = null, params object?[] args) =>
        SendLog("error", msg is not null ? [FormatPrintf(msg, args)] : [], obj);

    public void Fatal(string msg, params object?[] args) =>
        SendLog("fatal", [FormatPrintf(msg, args)], null);

    public void Fatal(JsonObject obj, string? msg = null, params object?[] args) =>
        SendLog("fatal", msg is not null ? [FormatPrintf(msg, args)] : [], obj);

    // ── Child loggers ──────────────────────────────────────────────────────────

    /// <summary>Creates a child logger with additional persistent field bindings merged on top of this logger's bindings.</summary>
    public ChildLogger GetChild(JsonObject bindings)
    {
        var merged = new JsonObject();

        if (_bindings is not null)
            foreach (var kv in _bindings)
                merged[kv.Key] = kv.Value?.DeepClone();

        foreach (var kv in bindings)
            merged[kv.Key] = kv.Value?.DeepClone();

        return new ChildLogger(_ipc, merged, _level);
    }

    /// <summary>Creates a child logger with a single additional binding.</summary>
    public ChildLogger GetChild(string key, string value) =>
        GetChild(new JsonObject { [key] = value });
}

/// <summary>
/// Static logger facade. Methods on this class emit structured log entries to the host
/// over IPC. Use <see cref="GetChild(JsonObject)"/> or <see cref="GetChild(string,string)"/>
/// to create a child logger with persistent field bindings attached to every log entry.
/// </summary>
public static class Logger
{
    private static readonly ChildLogger _root =
        new(IpcChannel.Instance, null, "trace");

    /// <summary>The minimum log level that will be emitted.</summary>
    public static string Level
    {
        get => _root.Level;
        set => _root.Level = value;
    }

    /// <summary>Returns <c>true</c> if <paramref name="level"/> is at or above the current level threshold.</summary>
    public static bool IsLevelEnabled(string level) => _root.IsLevelEnabled(level);

    // ── Log methods ────────────────────────────────────────────────────────────

    public static void Trace(string msg, params object?[] args) => _root.Trace(msg, args);
    public static void Trace(JsonObject obj, string? msg = null, params object?[] args) => _root.Trace(obj, msg, args);

    public static void Debug(string msg, params object?[] args) => _root.Debug(msg, args);
    public static void Debug(JsonObject obj, string? msg = null, params object?[] args) => _root.Debug(obj, msg, args);

    public static void Info(string msg, params object?[] args) => _root.Info(msg, args);
    public static void Info(JsonObject obj, string? msg = null, params object?[] args) => _root.Info(obj, msg, args);

    public static void Warn(string msg, params object?[] args) => _root.Warn(msg, args);
    public static void Warn(JsonObject obj, string? msg = null, params object?[] args) => _root.Warn(obj, msg, args);

    public static void Error(string msg, params object?[] args) => _root.Error(msg, args);
    public static void Error(JsonObject obj, string? msg = null, params object?[] args) => _root.Error(obj, msg, args);

    public static void Fatal(string msg, params object?[] args) => _root.Fatal(msg, args);
    public static void Fatal(JsonObject obj, string? msg = null, params object?[] args) => _root.Fatal(obj, msg, args);

    // ── Child loggers ──────────────────────────────────────────────────────────

    /// <summary>Creates a child logger with persistent field bindings.</summary>
    public static ChildLogger GetChild(JsonObject bindings) => _root.GetChild(bindings);

    /// <summary>Creates a child logger with a single binding.</summary>
    public static ChildLogger GetChild(string key, string value) => _root.GetChild(key, value);
}
