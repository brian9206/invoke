using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace Invoke.SourceGenerator;

/// <summary>
/// Incremental source generator that processes <c>[EntryPoint]</c> and
/// generates:
/// <list type="bullet">
///   <item>A top-level <c>Program.Main</c> that boots the correct runtime path.</item>
///   <item>A <c>partial</c> Router implementation with dispatched HTTP routes.</item>
///   <item>A <c>partial</c> RealtimeNamespace implementation with event dispatch.</item>
/// </list>
/// </summary>
[Generator(LanguageNames.CSharp)]
public sealed class EntryPointGenerator : IIncrementalGenerator
{
    // ── Attribute full names ──────────────────────────────────────────────────

    private const string EntryPointAttr       = "Invoke.EntryPointAttribute";
    private const string HttpGetAttr          = "Invoke.HttpGetAttribute";
    private const string HttpPostAttr         = "Invoke.HttpPostAttribute";
    private const string HttpPutAttr          = "Invoke.HttpPutAttribute";
    private const string HttpPatchAttr        = "Invoke.HttpPatchAttribute";
    private const string HttpDeleteAttr       = "Invoke.HttpDeleteAttribute";
    private const string HttpOptionsAttr      = "Invoke.HttpOptionsAttribute";
    private const string RealtimeEventAttr    = "Invoke.RealtimeEventAttribute";
    private const string RouterBase           = "Invoke.Router";
    private const string RealtimeNamespaceBase = "Invoke.RealtimeNamespace";
    private const string IEntryPointInterface = "Invoke.IEntryPoint";

    // ── Registration ──────────────────────────────────────────────────────────

    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        // Collect all type declarations that carry [EntryPoint]
        var entryTypes = context.SyntaxProvider
            .CreateSyntaxProvider(
                predicate: static (node, _) => node is TypeDeclarationSyntax or MethodDeclarationSyntax,
                transform: static (ctx, _) => GetEntryPointTarget(ctx))
            .Where(static t => t is not null)
            .Collect();

        context.RegisterSourceOutput(entryTypes, Execute);
    }

    // ── Syntax filter ─────────────────────────────────────────────────────────

    private static EntryTarget? GetEntryPointTarget(GeneratorSyntaxContext ctx)
    {
        var node = ctx.Node;
        var model = ctx.SemanticModel;

        // --- Class / struct with [EntryPoint] ---
        if (node is TypeDeclarationSyntax typeDecl)
        {
            var symbol = model.GetDeclaredSymbol(typeDecl);
            if (symbol is null) return null;
            if (!HasAttribute(symbol, EntryPointAttr)) return null;
            return new EntryTarget(symbol);
        }

        // --- Static method with [EntryPoint] ---
        if (node is MethodDeclarationSyntax methodDecl)
        {
            var symbol = model.GetDeclaredSymbol(methodDecl) as IMethodSymbol;
            if (symbol is null) return null;
            if (!HasAttribute(symbol, EntryPointAttr)) return null;
            if (!symbol.IsStatic) return null;
            return new EntryTarget(symbol);
        }

        return null;
    }

    // ── Code generation ───────────────────────────────────────────────────────

    private static void Execute(
        SourceProductionContext ctx,
        System.Collections.Immutable.ImmutableArray<EntryTarget?> targets)
    {
        if (targets.IsDefaultOrEmpty) return;

        // Only the first [EntryPoint] wins
        var target = targets.FirstOrDefault(t => t is not null);
        if (target is null) return;

        if (target.Method is not null)
        {
            // Pattern 1: static method handler
            GenerateStaticHandlerEntry(ctx, target.Method);
        }
        else if (target.Type is not null)
        {
            var type = target.Type;

            if (InheritsFrom(type, RouterBase))
            {
                // Pattern 3: Router subclass
                GenerateRouterPartial(ctx, type);
                GenerateEntryForClass(ctx, type, isRealtime: false);
            }
            else if (InheritsFrom(type, RealtimeNamespaceBase))
            {
                // Pattern 4: RealtimeNamespace subclass
                GenerateRealtimePartial(ctx, type);
                GenerateEntryForClass(ctx, type, isRealtime: true);
            }
            else if (ImplementsInterface(type, IEntryPointInterface))
            {
                // Pattern 2: IEntryPoint class
                GenerateEntryForClass(ctx, type, isRealtime: false);
            }
        }
    }

    // ── Pattern 1: static method ──────────────────────────────────────────────

    private static void GenerateStaticHandlerEntry(SourceProductionContext ctx, IMethodSymbol method)
    {
        var containingType = method.ContainingType.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
        var methodName = method.Name;

        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated/>");
        sb.AppendLine("#nullable enable");
        sb.AppendLine();
        sb.AppendLine("internal partial class Program");
        sb.AppendLine("{");
        sb.AppendLine("    public static async global::System.Threading.Tasks.Task Main(string[] args)");
        sb.AppendLine($"        => await global::Invoke.Internal.WorkerRuntime.Run({containingType}.{methodName});");
        sb.AppendLine("}");

        ctx.AddSource("InvokeEntry.g.cs", SourceText.From(sb.ToString(), Encoding.UTF8));
    }

    // ── Pattern 2 + shared: class entry ───────────────────────────────────────

    private static void GenerateEntryForClass(SourceProductionContext ctx, INamedTypeSymbol type, bool isRealtime)
    {
        var fullyQualified = type.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);

        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated/>");
        sb.AppendLine("#nullable enable");
        sb.AppendLine();
        sb.AppendLine("internal partial class Program");
        sb.AppendLine("{");
        sb.AppendLine("    public static async global::System.Threading.Tasks.Task Main(string[] args)");

        if (isRealtime)
        {
            sb.AppendLine($"        => await global::Invoke.Internal.WorkerRuntime.RunRealtime(new {fullyQualified}());");
        }
        else
        {
            sb.AppendLine($"        => await global::Invoke.Internal.WorkerRuntime.Run(new {fullyQualified}());");
        }

        sb.AppendLine("}");

        ctx.AddSource("InvokeEntry.g.cs", SourceText.From(sb.ToString(), Encoding.UTF8));
    }

    // ── Pattern 3: Router partial ─────────────────────────────────────────────

    private static void GenerateRouterPartial(SourceProductionContext ctx, INamedTypeSymbol type)
    {
        var routes = CollectRoutes(type);
        var ns = type.ContainingNamespace?.IsGlobalNamespace == true
            ? null
            : type.ContainingNamespace?.ToDisplayString();

        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated/>");
        sb.AppendLine("#nullable enable");
        sb.AppendLine();

        if (ns is not null)
        {
            sb.AppendLine($"namespace {ns}");
            sb.AppendLine("{");
        }

        sb.AppendLine($"partial class {type.Name}");
        sb.AppendLine("{");
        sb.AppendLine("    public override async global::System.Threading.Tasks.Task Main(");
        sb.AppendLine("        global::Invoke.InvokeRequest req,");
        sb.AppendLine("        global::Invoke.InvokeResponse res)");
        sb.AppendLine("    {");

        foreach (var route in routes)
        {
            sb.AppendLine($"        if (req.Method == \"{route.HttpMethod}\" && global::Invoke.Internal.PathMatcher.Match(\"{route.Path}\", req.Path, out var _{route.SafeName}Params))");
            sb.AppendLine("        {");
            sb.AppendLine($"            req.SetParams(_{route.SafeName}Params);");
            sb.AppendLine($"            await {route.MethodName}(req, res);");
            sb.AppendLine("            return;");
            sb.AppendLine("        }");
        }

        sb.AppendLine("        res.Status(404).Send(\"Not Found\");");
        sb.AppendLine("    }");
        sb.AppendLine("}");

        if (ns is not null)
            sb.AppendLine("}");

        ctx.AddSource($"{type.Name}.Router.g.cs", SourceText.From(sb.ToString(), Encoding.UTF8));
    }

    // ── Pattern 4: RealtimeNamespace partial ──────────────────────────────────

    private static void GenerateRealtimePartial(SourceProductionContext ctx, INamedTypeSymbol type)
    {
        var events = CollectRealtimeEvents(type);
        var ns = type.ContainingNamespace?.IsGlobalNamespace == true
            ? null
            : type.ContainingNamespace?.ToDisplayString();

        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated/>");
        sb.AppendLine("#nullable enable");
        sb.AppendLine();

        if (ns is not null)
        {
            sb.AppendLine($"namespace {ns}");
            sb.AppendLine("{");
        }

        sb.AppendLine($"partial class {type.Name}");
        sb.AppendLine("{");
        sb.AppendLine("    protected override async global::System.Threading.Tasks.Task DispatchEvent(");
        sb.AppendLine("        string eventName,");
        sb.AppendLine("        global::System.Text.Json.Nodes.JsonNode? payload)");
        sb.AppendLine("    {");
        sb.AppendLine("        switch (eventName)");
        sb.AppendLine("        {");

        foreach (var ev in events)
        {
            sb.AppendLine($"            case \"{ev.EventName}\":");
            sb.AppendLine($"                await {ev.MethodName}(payload!);");
            sb.AppendLine("                return;");
        }

        sb.AppendLine("        }");
        sb.AppendLine("    }");
        sb.AppendLine("}");

        if (ns is not null)
            sb.AppendLine("}");

        ctx.AddSource($"{type.Name}.Realtime.g.cs", SourceText.From(sb.ToString(), Encoding.UTF8));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool HasAttribute(ISymbol symbol, string fullyQualifiedName)
    {
        foreach (var attr in symbol.GetAttributes())
        {
            if (attr.AttributeClass?.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat)
                    == $"global::{fullyQualifiedName}"
                || attr.AttributeClass?.ToDisplayString() == fullyQualifiedName)
                return true;
        }
        return false;
    }

    private static bool InheritsFrom(INamedTypeSymbol type, string baseTypeFqn)
    {
        var current = type.BaseType;
        while (current is not null)
        {
            var display = current.ToDisplayString();
            if (display == baseTypeFqn) return true;
            current = current.BaseType;
        }
        return false;
    }

    private static bool ImplementsInterface(INamedTypeSymbol type, string interfaceFqn)
    {
        foreach (var iface in type.AllInterfaces)
        {
            if (iface.ToDisplayString() == interfaceFqn) return true;
        }
        return false;
    }

    private static List<RouteEntry> CollectRoutes(INamedTypeSymbol type)
    {
        var routes = new List<RouteEntry>();
        var httpAttrs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [HttpGetAttr]     = "GET",
            [HttpPostAttr]    = "POST",
            [HttpPutAttr]     = "PUT",
            [HttpPatchAttr]   = "PATCH",
            [HttpDeleteAttr]  = "DELETE",
            [HttpOptionsAttr] = "OPTIONS",
        };

        foreach (var member in type.GetMembers().OfType<IMethodSymbol>())
        {
            foreach (var attr in member.GetAttributes())
            {
                var attrName = attr.AttributeClass?.ToDisplayString() ?? string.Empty;
                if (!httpAttrs.TryGetValue(attrName, out var httpMethod)) continue;

                var path = attr.ConstructorArguments.Length > 0
                    ? attr.ConstructorArguments[0].Value as string ?? "/"
                    : "/";

                routes.Add(new RouteEntry(httpMethod, path, member.Name));
            }
        }

        return routes;
    }

    private static List<RealtimeEventEntry> CollectRealtimeEvents(INamedTypeSymbol type)
    {
        var events = new List<RealtimeEventEntry>();

        foreach (var member in type.GetMembers().OfType<IMethodSymbol>())
        {
            foreach (var attr in member.GetAttributes())
            {
                var attrName = attr.AttributeClass?.ToDisplayString() ?? string.Empty;
                if (attrName != RealtimeEventAttr) continue;

                var eventName = attr.ConstructorArguments.Length > 0
                    ? attr.ConstructorArguments[0].Value as string ?? string.Empty
                    : string.Empty;

                if (string.IsNullOrEmpty(eventName)) continue;
                events.Add(new RealtimeEventEntry(eventName, member.Name));
            }
        }

        return events;
    }

    // ── Data records ──────────────────────────────────────────────────────────

    private sealed class EntryTarget
    {
        public INamedTypeSymbol? Type { get; }
        public IMethodSymbol? Method { get; }

        public EntryTarget(INamedTypeSymbol type) => Type = type;
        public EntryTarget(IMethodSymbol method) => Method = method;
    }

    private sealed class RouteEntry
    {
        public string HttpMethod { get; }
        public string Path { get; }
        public string MethodName { get; }
        public string SafeName => MethodName.Replace("-", "_");

        public RouteEntry(string httpMethod, string path, string methodName)
        {
            HttpMethod = httpMethod;
            Path = path;
            MethodName = methodName;
        }
    }

    private sealed class RealtimeEventEntry
    {
        public string EventName { get; }
        public string MethodName { get; }

        public RealtimeEventEntry(string eventName, string methodName)
        {
            EventName = eventName;
            MethodName = methodName;
        }
    }
}
