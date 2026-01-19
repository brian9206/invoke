/**
 * Frontend utility functions for Invoke Admin
 */

let cachedFunctionBaseUrl: string | null = null;
let fetchPromise: Promise<string> | null = null;

/**
 * Get the function base URL from global settings (with caching)
 * @returns {Promise<string>} Function base URL
 */
export async function getFunctionBaseUrl(): Promise<string> {
  // Return cached value if available
  if (cachedFunctionBaseUrl) {
    return cachedFunctionBaseUrl;
  }

  // Return existing promise if one is in progress
  if (fetchPromise) {
    return fetchPromise;
  }

  // Create new fetch promise
  fetchPromise = (async () => {
    try {
      const response = await fetch('/api/admin/global-settings');
      const data = await response.json();
      
      if (data.success && data.data.function_base_url) {
        cachedFunctionBaseUrl = data.data.function_base_url.value.replace(/\/+$/, '');
        return cachedFunctionBaseUrl;
      }
      
      // Fallback to default if not found
      cachedFunctionBaseUrl = 'https://localhost:3001/invoke';
      return cachedFunctionBaseUrl;
    } catch (error) {
      console.error('Failed to get function base URL:', error);
      // Fallback to default on error
      cachedFunctionBaseUrl = 'https://localhost:3001/invoke';
      return cachedFunctionBaseUrl;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Generate a complete function URL
 * @param {string} functionId - Function ID
 * @returns {Promise<string>} Complete function URL
 */
export async function getFunctionUrl(functionId: string): Promise<string> {
  const baseUrl = await getFunctionBaseUrl();
  return `${baseUrl}/${functionId}`;
}

/**
 * Clear the cached function base URL (useful when settings are updated)
 */
export function clearFunctionBaseUrlCache(): void {
  cachedFunctionBaseUrl = null;
  fetchPromise = null;
}