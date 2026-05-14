using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
  [HttpGet("/")]
  public async Task HelloWorld(InvokeRequest req, InvokeResponse res)
  {
    var kv = new KeyValueStore();
    await kv.Set("last_visit", DateTime.UtcNow.ToString("O"));

    // Structured object logging
    Logger.Info(new JsonObject() { ["foo"] = "bar" });

    // Printf-style formatting (%s, %d, %f, %j for JsonNode)
    Logger.Info("%s has won %d dollars!", "Brian", 100000);

    // Log with both a structured object and a message
    Logger.Warn(new JsonObject() { ["method"] = req.Method, ["path"] = req.Path }, "Incoming request");

    // Child logger with persistent bindings (JsonObject overload)
    var child = Logger.GetChild(new JsonObject() { ["module"] = "auth-service" });
    child.Info("hello world");

    // Child logger with persistent bindings (key/value shorthand)
    var child2 = Logger.GetChild("module", "another-service");
    child2.Info("%s has won %d dollars!", "Brian", 100000);

    res.Status(200).Json(new JsonObject()
    {
      ["success"] = true,
      ["message"] = "Hello, world",
      ["method"] = req.Method,
      ["path"] = req.Path
    });
  }

  [HttpGet("/users/:id")]
  public Task GetUser(InvokeRequest req, InvokeResponse res)
  {
    var id = req.Params["id"];

    res.Status(200).Json(new JsonObject()
    {
      ["id"] = id
    });

    return Task.CompletedTask;
  }

  [HttpPost("/echo")]
  public Task Echo(InvokeRequest req, InvokeResponse res)
  {
    res.Status(200).Json(req.Body);
    return Task.CompletedTask;
  }
}
