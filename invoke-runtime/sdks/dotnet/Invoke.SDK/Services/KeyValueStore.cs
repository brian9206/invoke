using Invoke.Internal;

namespace Invoke;

/// <summary>
/// Distributed key-value store backed by the platform KV service.
/// Operations are forwarded to the host runtime over IPC and resolved
/// asynchronously.
///
/// <code>
/// var kv = new KeyValueStore();
/// await kv.Set("counter", 42, ttlMs: 60_000);
/// var value = await kv.Get("counter");
/// </code>
/// </summary>
public sealed class KeyValueStore
{
    private readonly KvClient _client;

    /// <summary>Create a <see cref="KeyValueStore"/> backed by the platform IPC.</summary>
    public KeyValueStore()
    {
        _client = KvClient.Instance;
    }

    /// <summary>
    /// Get a value by key.
    /// </summary>
    /// <param name="key">Key name.</param>
    /// <returns>The stored value, or <c>null</c> if the key does not exist.</returns>
    public Task<object?> Get(string key) => _client.GetAsync(key);

    /// <summary>
    /// Set a value by key with an optional TTL.
    /// </summary>
    /// <param name="key">Key name.</param>
    /// <param name="value">Value to store (must be JSON-serialisable).</param>
    /// <param name="ttlMs">Optional expiry in milliseconds.</param>
    public Task Set(string key, object? value, long? ttlMs = null) =>
        _client.SetAsync(key, value, ttlMs);

    /// <summary>Delete a key.</summary>
    /// <param name="key">Key name.</param>
    public Task Delete(string key) => _client.DeleteAsync(key);

    /// <summary>List all keys matching an optional prefix.</summary>
    /// <param name="prefix">Prefix filter. Pass <c>null</c> or empty to list all keys.</param>
    /// <returns>An array of matching key names.</returns>
    public Task<string[]> List(string? prefix = null) => _client.ListAsync(prefix);
}
