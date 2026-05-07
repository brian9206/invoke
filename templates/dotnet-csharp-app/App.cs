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
