using Invoke;
using System.Text.Json.Nodes;

public static class Function
{
  [EntryPoint]
  public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
  {
    res.Status(200).Json(new JsonObject()
    {
      ["success"] = true,
      ["message"] = "Hello, world"
    });

    return Task.CompletedTask;
  }
}
