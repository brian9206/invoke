using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;

namespace Invoke.Internal;

/// <summary>
/// Core runtime bootstrap.  The source-generated <c>Program.Main</c> delegates
/// to one of the static methods here to handle the full IPC lifecycle.
/// </summary>
public static class WorkerRuntime
{
    // ── HTTP function entry points ─────────────────────────────────────────────

    /// <summary>Run a static handler: <c>static Task Handler(InvokeRequest, InvokeResponse)</c>.</summary>
    public static Task Run(Func<InvokeRequest, InvokeResponse, Task> handler)
        => RunCore(async (req, res) => await handler(req, res));

    /// <summary>Run a class-based handler that implements <see cref="Invoke.IEntryPoint"/>.</summary>
    public static Task Run(Invoke.IEntryPoint entry)
        => RunCore((req, res) => entry.Main(req, res));

    // ── Realtime namespace entry point ────────────────────────────────────────

    /// <summary>Run a <see cref="Invoke.RealtimeNamespace"/> subclass.</summary>
    public static Task RunRealtime(Invoke.RealtimeNamespace ns)
        => RunRealtimeCore(ns);

    // ── Implementation ────────────────────────────────────────────────────────

    private static async Task WaitForDebugger()
    {
        var isDebugMode = Environment.GetEnvironmentVariable("INVOKE_TESTING_MODE") == "debug";

        if (isDebugMode)
        {
            Console.WriteLine("Waiting for debugger to attach... (set INVOKE_TESTING_MODE=debug to enable)");
            while (!System.Diagnostics.Debugger.IsAttached)
            {
                await Task.Delay(100);
            }
            Console.WriteLine("Debugger attached.");
        }
    }

    private static async Task RunCore(Func<Invoke.InvokeRequest, Invoke.InvokeResponse, Task> handler)
    {
        await WaitForDebugger();

        var ipc = IpcChannel.Instance;

        // Announce ourselves and request the payload
        await ipc.SendAsync("payload");

        var payloadEl = await ipc.WaitForAsync("payload");
        var payload = Deserialize(payloadEl, IpcJsonContext.Default.IpcPayload) ?? throw new InvalidOperationException("Null payload from host");

        if (payload.Type != "execute")
            throw new InvalidOperationException($"Unexpected payload type '{payload.Type}' for HTTP handler");

        var requestData = payload.Request ?? throw new InvalidOperationException("Missing request in payload");

        // Redirect console to IPC
        Console.SetOut(new IpcConsoleWriter(ipc, "log"));
        Console.SetError(new IpcConsoleWriter(ipc, "error"));

        var req = Invoke.InvokeRequest.FromIpc(requestData);
        var res = new Invoke.InvokeResponse();

        try
        {
            await handler(req, res);
        }
        catch (Exception ex)
        {
            await ipc.EndAsync("worker_error", new IpcWorkerErrorPayload { Error = ex.ToString() },
                IpcJsonContext.Default.IpcOutboundFrameIpcWorkerErrorPayload);
            return;
        }

        var body = res.GetBody();
        var responseData = new IpcResponseData
        {
            StatusCode = res.StatusCode,
            Headers = res.GetHeaders(),
            Body = body is null ? null : Convert.ToBase64String(body)
        };

        await ipc.EndAsync("execute_result", new IpcExecuteResultPayload { Response = responseData },
            IpcJsonContext.Default.IpcOutboundFrameIpcExecuteResultPayload);
    }

    private static async Task RunRealtimeCore(Invoke.RealtimeNamespace ns)
    {
        await WaitForDebugger();

        var ipc = IpcChannel.Instance;

        await ipc.SendAsync("payload");
        var payloadEl = await ipc.WaitForAsync("payload");
        var payload = Deserialize(payloadEl, IpcJsonContext.Default.IpcPayload) ?? throw new InvalidOperationException("Null payload from host");

        // Redirect console to IPC
        Console.SetOut(new IpcConsoleWriter(ipc, "log"));
        Console.SetError(new IpcConsoleWriter(ipc, "error"));

        if (payload.Type == "execute")
        {
            // Realtime dispatch: event name and optional single argument
            var eventName = payload.RealtimeEvent ?? string.Empty;
            var socketId = payload.SocketId ?? string.Empty;

            JsonNode? arg = null;
            if (payload.Args is { Length: > 0 })
                arg = JsonNode.Parse(payload.Args[0].GetRawText());

            try
            {
                await ns.HandleEvent(eventName, socketId, arg);
            }
            catch (Exception ex)
            {
                await ipc.EndAsync("worker_error", new IpcWorkerErrorPayload { Error = ex.ToString() },
                    IpcJsonContext.Default.IpcOutboundFrameIpcWorkerErrorPayload);
                return;
            }

            // Realtime handlers don't return an HTTP response — send a 204
            var responseData = new IpcResponseData { StatusCode = 204, Headers = new(), Body = null };
            await ipc.EndAsync("execute_result", new IpcExecuteResultPayload { Response = responseData },
                IpcJsonContext.Default.IpcOutboundFrameIpcExecuteResultPayload);
        }
        else
        {
            throw new InvalidOperationException($"Unexpected payload type '{payload.Type}' for realtime handler");
        }
    }

    private static T? Deserialize<T>(System.Text.Json.JsonElement? el,
        JsonTypeInfo<T> typeInfo)
    {
        if (el is null) return default;
        return JsonSerializer.Deserialize(el.Value.GetRawText(), typeInfo);
    }
}

/// <summary>
/// TextWriter that redirects <see cref="Console"/> output to the host via IPC
/// <c>console_log</c> events.
/// </summary>
internal sealed class IpcConsoleWriter : System.IO.TextWriter
{
    private readonly IpcChannel _ipc;
    private readonly string _level;

    public IpcConsoleWriter(IpcChannel ipc, string level)
    {
        _ipc = ipc;
        _level = level;
    }

    public override System.Text.Encoding Encoding => System.Text.Encoding.UTF8;

    public override void WriteLine(string? value)
    {
        // Fire-and-forget — we don't await to avoid deadlocks in sync contexts
        _ = _ipc.SendAsync("console_log",
            new IpcConsoleLogPayload { Level = _level, Args = [value ?? string.Empty] },
            IpcJsonContext.Default.IpcOutboundFrameIpcConsoleLogPayload);
    }

    public override void Write(string? value)
    {
        if (value is not null)
            _ = _ipc.SendAsync("console_log",
                new IpcConsoleLogPayload { Level = _level, Args = [value] },
                IpcJsonContext.Default.IpcOutboundFrameIpcConsoleLogPayload);
    }
}
