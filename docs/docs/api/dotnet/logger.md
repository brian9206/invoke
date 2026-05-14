# Logger

`Logger` is a static class that provides structured logging for C# functions. Log entries are sent to the Invoke platform over IPC and appear in the function's log stream in real time.

```csharp
using Invoke;
using System.Text.Json.Nodes;

Logger.Info("Handler started");
Logger.Info(new JsonObject { ["userId"] = 42, ["action"] = "login" });
Logger.Warn("%s has won %d dollars!", "Brian", 100_000);

var child = Logger.GetChild("module", "auth-service");
child.Info("Token validated");
```

## Log Levels

Six log levels are supported, in ascending order of severity:

| Level   | Method         | Severity |
| ------- | -------------- | -------- |
| `trace` | `Logger.Trace` | Lowest   |
| `debug` | `Logger.Debug` |          |
| `info`  | `Logger.Info`  | Default  |
| `warn`  | `Logger.Warn`  |          |
| `error` | `Logger.Error` |          |
| `fatal` | `Logger.Fatal` | Highest  |

The current minimum level is controlled by `Logger.Level`. Log calls below the threshold are discarded without sending anything over IPC.

```csharp
Logger.Level = "warn"; // only warn, error, and fatal will be emitted
```

## Method Signatures

Each level has two overloads.

### String message with printf-style formatting

```csharp
Logger.Info(string msg, params object?[] args)
```

Formats `msg` using printf-style specifiers before sending. See [Printf Formatting](#printf-formatting) below.

```csharp
Logger.Info("User %s signed in from %s", username, ipAddress);
Logger.Error("Request failed with status %d", statusCode);
```

### Structured object with optional message

```csharp
Logger.Info(JsonObject obj, string? msg = null, params object?[] args)
```

Sends `obj` as structured `details` in the log entry. If `msg` is provided it is printf-formatted and included as the log message.

```csharp
// Object only — no message
Logger.Info(new JsonObject { ["foo"] = "bar" });

// Object + message
Logger.Warn(
    new JsonObject { ["method"] = req.Method, ["path"] = req.Path },
    "Incoming request"
);

// Object + formatted message
Logger.Error(
    new JsonObject { ["code"] = errorCode },
    "Operation failed after %d retries",
    retryCount
);
```

## Printf Formatting

The following format specifiers are supported in message strings:

| Specifier | Behavior                                                                          |
| --------- | --------------------------------------------------------------------------------- |
| `%s`      | `ToString()` of the argument                                                      |
| `%d`      | Integer representation                                                            |
| `%i`      | Integer representation (alias for `%d`)                                           |
| `%f`      | Floating-point representation                                                     |
| `%o`      | `ToString()` of the argument                                                      |
| `%O`      | `ToString()` of the argument                                                      |
| `%j`      | `JsonNode.ToJsonString()` if the argument is a `JsonNode`; otherwise `ToString()` |

Any extra arguments beyond the number of format specifiers are appended to the message separated by spaces.

```csharp
Logger.Info("%s scored %d points (%.1f avg)", "Alice", 120, 24.5);
// → "Alice scored 120 points (24.5 avg)"

var data = new JsonObject { ["id"] = 1, ["name"] = "Alice" };
Logger.Debug("Payload: %j", data);
// → "Payload: {"id":1,"name":"Alice"}"

Logger.Info("Extra args", "appended", "here");
// → "Extra args appended here"
```

## Child Loggers

`Logger.GetChild` returns a `ChildLogger` instance that automatically attaches persistent fields to every log entry it emits. Child loggers can themselves spawn further children — bindings accumulate at each level.

### `GetChild(JsonObject bindings)`

Create a child with one or more persistent fields:

```csharp
var child = Logger.GetChild(new JsonObject
{
    ["module"] = "payments",
    ["requestId"] = requestId
});

child.Info("Processing payment");
// details: { "module": "payments", "requestId": "..." }
```

### `GetChild(string key, string value)`

Shorthand for a single binding:

```csharp
var child = Logger.GetChild("module", "auth-service");
child.Info("Token validated");
// details: { "module": "auth-service" }
```

### Nesting child loggers

```csharp
var serviceLogger = Logger.GetChild("service", "api");
var requestLogger = serviceLogger.GetChild("requestId", requestId);

requestLogger.Info("Started");
// details: { "service": "api", "requestId": "..." }
```

### `ChildLogger` API

`ChildLogger` exposes the same methods and properties as the static `Logger` class, plus its own `GetChild`:

```csharp
ChildLogger child = Logger.GetChild("module", "worker");

child.Trace(string msg, params object?[] args)
child.Debug(string msg, params object?[] args)
child.Info(string msg, params object?[] args)
child.Warn(string msg, params object?[] args)
child.Error(string msg, params object?[] args)
child.Fatal(string msg, params object?[] args)

// Object overloads (same pattern as Logger)
child.Info(JsonObject obj, string? msg = null, params object?[] args)

child.Level               // get/set minimum level
child.IsLevelEnabled(string level)  // → bool
child.GetChild(JsonObject bindings) // → ChildLogger
child.GetChild(string key, string value) // → ChildLogger
```

## `IsLevelEnabled`

Check whether a given level will be emitted before doing expensive work:

```csharp
if (Logger.IsLevelEnabled("debug"))
{
    var snapshot = BuildExpensiveDebugSnapshot();
    Logger.Debug(snapshot, "State snapshot");
}
```

## `Console` Output

`Console.WriteLine` and `Console.Write` are automatically redirected to the platform log stream at `info` level. `Console.Error.WriteLine` is redirected at `error` level. You do not need to configure anything; however, using `Logger` directly is preferred because it supports structured fields and level filtering.

```csharp
Console.WriteLine("hello");         // → info log: "hello"
Console.Error.WriteLine("oops");    // → error log: "oops"
```
