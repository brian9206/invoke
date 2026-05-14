using System.Text.RegularExpressions;

namespace Invoke.Internal;

/// <summary>
/// Lightweight route pattern matcher that converts Express-style path templates
/// (e.g. <c>"/users/:id"</c>) into named-capture regexes and extracts params.
/// NativeAOT safe — no reflection; patterns are compiled at startup.
/// </summary>
public static class PathMatcher
{
    private static readonly Dictionary<string, Regex> _cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly object _cacheLock = new();

    /// <summary>
    /// Try to match <paramref name="requestPath"/> against <paramref name="pattern"/>.
    /// On success, <paramref name="parameters"/> contains the extracted named parameters.
    /// </summary>
    public static bool Match(
        string pattern,
        string requestPath,
        out IReadOnlyDictionary<string, string> parameters)
    {
        var regex = GetOrCreate(pattern);
        var m = regex.Match(requestPath);

        if (!m.Success)
        {
            parameters = new Dictionary<string, string>();
            return false;
        }

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Group group in m.Groups)
        {
            if (!int.TryParse(group.Name, out _)) // skip numeric groups
                result[group.Name] = group.Value;
        }

        parameters = result;
        return true;
    }

    private static Regex GetOrCreate(string pattern)
    {
        lock (_cacheLock)
        {
            if (_cache.TryGetValue(pattern, out var cached)) return cached;

            var regexStr = ConvertToRegex(pattern);
            var regex = new Regex(regexStr,
                RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
            _cache[pattern] = regex;
            return regex;
        }
    }

    /// <summary>
    /// Convert an Express-style path pattern to a named-capture regex string.
    /// <list type="bullet">
    ///   <item><c>/users/:id</c> → <c>^/users/(?&lt;id&gt;[^/]+)$</c></item>
    ///   <item><c>/files/*</c>   → <c>^/files/(.*)$</c></item>
    ///   <item><c>/</c>          → <c>^/$</c></item>
    /// </list>
    /// </summary>
    private static string ConvertToRegex(string pattern)
    {
        var sb = new System.Text.StringBuilder("^");

        for (int i = 0; i < pattern.Length; i++)
        {
            var ch = pattern[i];

            if (ch == ':')
            {
                // Named param: read until next '/' or end
                int start = i + 1;
                int end = start;
                while (end < pattern.Length && pattern[end] != '/') end++;
                var name = pattern[start..end];
                sb.Append($"(?<{name}>[^/]+)");
                i = end - 1;
            }
            else if (ch == '*')
            {
                sb.Append("(.*)");
            }
            else
            {
                sb.Append(Regex.Escape(ch.ToString()));
            }
        }

        sb.Append('$');
        return sb.ToString();
    }
}
