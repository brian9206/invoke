# .NET (C#) SDK Overview

The Invoke C# SDK (`Invoke.SDK`) provides everything you need to write serverless functions in C# targeting .NET 10 NativeAOT.

## Setup

Add the following `app.csproj` to your function directory:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <PublishAot>true</PublishAot>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Invoke.SDK" Version="1.*" />
  </ItemGroup>
</Project>
```

## The `[EntryPoint]` Attribute

Every C# function must mark its entry point with `[EntryPoint]`. The SDK's source generator reads this attribute and generates `Program.Main` automatically.

Three patterns are supported:

### Simple Function — static method

```csharp
using Invoke;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["message"] = "Hello, World!" });
        return Task.CompletedTask;
    }
}
```

### Multi-Route App — `Router` subclass

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
    [HttpGet("/")]
    public Task Index(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["message"] = "Hello" });
        return Task.CompletedTask;
    }

    [HttpPost("/echo")]
    public Task Echo(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(req.Body);
        return Task.CompletedTask;
    }
}
```

### Realtime Handler — `RealtimeNamespace` subclass

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : RealtimeNamespace
{
    public App()
    {
        Namespace = "/chat";
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode arg)
    {
        await To("room").Emit("message", arg);
    }
}
```

## Namespaces

| Namespace | Content                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `Invoke`  | `InvokeRequest`, `InvokeResponse`, `Router`, `RealtimeNamespace`, `KeyValueStore`, and all attributes |

All types are available via `using Invoke;`. No additional namespaces are required for core functionality.

## Available APIs

| API                                              | Type           | Description                       |
| ------------------------------------------------ | -------------- | --------------------------------- |
| [`InvokeRequest`](/docs/api/dotnet/request)      | Class          | Incoming HTTP request data        |
| [`InvokeResponse`](/docs/api/dotnet/response)    | Class          | Fluent response builder           |
| [`Router`](/docs/api/dotnet/router)              | Abstract class | Attribute-based HTTP routing      |
| [`KeyValueStore`](/docs/api/dotnet/kv-store)     | Class          | Persistent distributed KV storage |
| [`RealtimeNamespace`](/docs/api/dotnet/realtime) | Abstract class | Socket.IO event-driven handlers   |
