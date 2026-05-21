namespace Invoke;

/// <summary>
/// Provides extension methods for working with Invoke environment.
/// </summary>
public static class EnvironmentEx
{
    /// <summary>
    /// Gets the value of an environment variable, or returns a default value if the variable is not set.
    /// </summary>
    /// <param name="name">Environment name</param>
    /// <param name="defaultValue">Default value to return if the environment variable is not set</param>
    /// <returns>String value of the environment variable or the default value</returns>
    public static string GetEnvironmentVariable(string name, string defaultValue = "")
    {
        var value = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrEmpty(value) ? defaultValue : value;
    }

    /// <summary>
    /// Gets the value of an environment variable, or returns a default value if the variable is not set.
    /// The value is interpreted as a boolean, where "true", "yes", "on", and "1" (case-insensitive) are considered true, and all other values are considered false.
    /// </summary>
    /// <param name="name">Environment name</param>
    /// <param name="defaultValue">Default value to return if the environment variable is not set</param>
    /// <returns>Boolean value of the environment variable or the default value</returns>
    public static bool GetEnvironmentVariableAsBool(string name, bool defaultValue = false)
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrEmpty(value)) return defaultValue;
        return value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("on", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("1", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Gets the value of an environment variable, or returns a default value if the variable is not set.
    /// The value is interpreted as an integer.
    /// </summary>
    /// <param name="name">Environment name</param>
    /// <param name="defaultValue">Default value to return if the environment variable is not set</param>
    /// <returns>Integer value of the environment variable or the default value</returns>
    public static int GetEnvironmentVariableAsInt(string name, int defaultValue = 0)
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrEmpty(value)) return defaultValue;
        return int.TryParse(value, out var result) ? result : defaultValue;
    }

    /// <summary>
    /// Determines whether the application is running in test mode.
    /// </summary>
    /// <returns>True if test mode is enabled, otherwise false</returns>
    public static bool IsTestMode()
    {
        return !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("INVOKE_TEST_MODE"));
    }

    /// <summary>
    /// Determines whether the application is running with debugger attached.
    /// </summary>
    /// <returns>True if debugging, otherwise false</returns>
    public static bool IsDebugging()
    {
        return Environment.GetEnvironmentVariable("INVOKE_TEST_MODE") == "debug";
    }

    /// <summary>
    /// Gets the connection string for the Invoke SQL database.
    /// </summary>
    /// <returns>Connection string for the Invoke SQL database. Empty if SQL database is not initialized.</returns>
    public static string GetConnectionString()
    {
        return GetEnvironmentVariable("ConnectionStrings__DefaultConnection", string.Empty);
    }
}
