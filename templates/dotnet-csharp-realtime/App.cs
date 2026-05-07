using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : RealtimeNamespace
{
  public App()
  {
    Namespace = "/echo";
  }

  [RealtimeEvent("echo")]
  public async Task OnEcho(JsonNode arg)
  {
    Console.WriteLine("Echo message: " + arg.GetValue<string>());
    await To("room").Emit("echo", arg);
  }

  [RealtimeEvent("broadcast")]
  public async Task OnBroadcast(JsonNode arg)
  {
    await Emit("broadcast", arg);
  }
}
