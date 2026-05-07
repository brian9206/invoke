namespace Invoke;

/// <summary>
/// Marks a static method or class as the entry point for an Invoke function.
/// The source generator will produce the <c>Program.Main</c> that wires it up.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class EntryPointAttribute : Attribute { }
